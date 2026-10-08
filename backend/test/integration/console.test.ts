import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RISK_RULE_DEFAULTS } from '../../src/generated/catalog.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, registerUser, type TestUser } from '../helpers/client.js';
import { ageDevice, calmSignals, grantConsent, registerStaff, scamSignals, startStepup } from '../helpers/flows.js';

const raise = { newLimitMinor: '1200000' };

describe('security console operations API', () => {
  let t: TestApp;
  let user: TestUser;
  let admin: string;
  let analyst: string;

  beforeAll(async () => {
    t = await startTestApp();
    user = await registerUser(t, 'amma', { displayName: 'Amma Lakshmi', locale: 'ta' });
    await grantConsent(t, user);
    await ageDevice(t, user);
    expect((await startStepup(t, user, 'raise_transfer_limit', raise, scamSignals())).status).toBe(200); // score 70
    expect((await startStepup(t, user, 'raise_transfer_limit', raise, calmSignals())).status).toBe(200); // score 0
    admin = (await registerStaff(t, 'admin', 'sec.lead')).accessToken;
    analyst = (await registerStaff(t, 'analyst', 'analyst.one')).accessToken;
  });
  afterAll(async () => {
    await t.close();
  });

  const lastAudit = (action: string) => t.deps.prisma.auditEvent.findFirst({ where: { action }, orderBy: { id: 'desc' } });

  describe('access control', () => {
    it('requires a staff token', async () => {
      expect((await call(t, 'GET', '/v1/admin/overview')).status).toBe(401);
      expect((await call(t, 'GET', '/v1/admin/overview', { token: user.accessToken })).status).toBe(401);
    });

    it('lets analysts read but not publish rules', async () => {
      for (const path of ['/v1/admin/overview', '/v1/admin/stepups', '/v1/admin/audit', '/v1/admin/risk/rules', '/v1/admin/users/lookup?q=amma']) {
        expect((await call(t, 'GET', path, { token: analyst })).status, path).toBe(200);
      }
      const rules = await call(t, 'GET', '/v1/admin/risk/rules', { token: analyst });
      const res = await call(t, 'POST', '/v1/admin/risk/rules', {
        token: analyst,
        body: { baseVersion: rules.body.active.version, note: 'try', draft: { guardianThreshold: 50, rules: rules.body.active.rules } },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('overview', () => {
    it('summarises step-ups, risk rules and totals for the window', async () => {
      const res = await call(t, 'GET', '/v1/admin/overview?days=7', { token: analyst });
      expect(res.status).toBe(200);
      const o = res.body;
      expect(o.window).toMatchObject({ days: 7, timezone: 'Asia/Kolkata' });
      expect(o.stepups.daily).toHaveLength(7);
      expect(o.stepups.daily.at(-1).day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const sum = (k: string) => o.stepups.daily.reduce((n: number, d: Record<string, number>) => n + d[k]!, 0);
      expect(sum('total')).toBe(2);
      expect(sum('guarded')).toBe(1);
      expect(o.stepups.byStatus).toEqual({ pending_user: 2 });
      expect(o.totals).toMatchObject({ activeUsers: 1, activeDevices: 1, openRecoveries: 0 });
      expect(o.risk.assessments).toBe(2);
      expect(o.risk.topRules.map((r: { key: string }) => r.key)).toEqual(expect.arrayContaining(['call_unknown_number', 'remote_access_app']));
      expect(o.risk).toMatchObject({ ruleSetVersion: 1, guardianThreshold: 50 });
      expect(o.guardians).toEqual({ approved: 0, denied: 0, medianResponseMs: null });
    });

    it('rejects an out-of-range window', async () => {
      expect((await call(t, 'GET', '/v1/admin/overview?days=365', { token: analyst })).status).toBe(400);
    });
  });

  describe('step-ups', () => {
    it('lists newest first with rule keys and no action parameters', async () => {
      const res = await call(t, 'GET', '/v1/admin/stepups', { token: analyst });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[1]).toMatchObject({ action: 'raise_transfer_limit', score: 70, needsGuardian: true, userId: user.id });
      expect(res.body.items[1].rules.map((r: { key: string }) => r.key)).toEqual(['call_unknown_number', 'remote_access_app']);
      expect(JSON.stringify(res.body)).not.toContain('1200000');
    });

    it('filters and pages with a cursor', async () => {
      const guarded = await call(t, 'GET', '/v1/admin/stepups?guarded=true', { token: analyst });
      expect(guarded.body.items.map((i: { score: number }) => i.score)).toEqual([70]);
      const first = await call(t, 'GET', '/v1/admin/stepups?limit=1', { token: analyst });
      expect(first.body.nextCursor).toBe(first.body.items[0].id);
      const second = await call(t, 'GET', `/v1/admin/stepups?limit=1&cursor=${first.body.nextCursor}`, { token: analyst });
      expect(second.body.items[0].score).toBe(70);
      expect(second.body.nextCursor).toBeNull();
    });
  });

  describe('audit log', () => {
    it('pages newest first and filters by action prefix', async () => {
      const all = await call(t, 'GET', '/v1/admin/audit?limit=3', { token: analyst });
      expect(all.body.items).toHaveLength(3);
      const ids = all.body.items.map((i: { id: string }) => BigInt(i.id));
      expect(ids[0] > ids[1] && ids[1] > ids[2]).toBe(true);
      const next = await call(t, 'GET', `/v1/admin/audit?limit=3&before=${all.body.nextBefore}`, { token: analyst });
      expect(BigInt(next.body.items[0].id) < ids[2]).toBe(true);

      const stepups = await call(t, 'GET', '/v1/admin/audit?action=stepup.', { token: analyst });
      expect(stepups.body.items.map((i: { action: string }) => i.action)).toEqual(['stepup.created', 'stepup.created']);
      expect(stepups.body.items[0].payload).toMatchObject({ action: 'raise_transfer_limit' });
    });

    it('verifies the chain and records that it did', async () => {
      const res = await call(t, 'POST', '/v1/admin/audit/verify', { token: analyst });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, brokenAtId: null });
      expect(res.body.checked).toBeGreaterThan(5);
      expect((await lastAudit('audit.chain_verified'))?.payload).toMatchObject({ ok: true, checked: res.body.checked });
    });
  });

  describe('CSV export', () => {
    it('exports step-ups and records the export', async () => {
      const res = await t.app.inject({ method: 'GET', url: '/v1/admin/stepups/export.csv?guarded=true', headers: { authorization: `Bearer ${analyst}` } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="cosign-stepups-.*\.csv"/);
      const lines = res.body.trim().split('\r\n');
      expect(lines[0]).toBe('id,created_at,resolved_at,user_id,device_id,action,status,score,needs_guardian,rule_set_version,rules,approvals,denials,failure_code');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(',70,true,1,call_unknown_number remote_access_app,0,0,');
      expect((await lastAudit('admin.exported'))?.payload).toMatchObject({ rows: 1, filters: { guarded: 'true' } });
    });

    it('exports the audit log with hashes', async () => {
      const res = await t.app.inject({ method: 'GET', url: '/v1/admin/audit/export.csv?action=stepup.', headers: { authorization: `Bearer ${analyst}` } });
      const lines = res.body.trim().split('\r\n');
      expect(lines[0]).toBe('id,created_at,actor_type,actor_id,action,subject_type,subject_id,payload,prev_hash,hash');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toMatch(/,[0-9a-f]{64},[0-9a-f]{64}$/);
    });
  });

  describe('user lookup', () => {
    it('finds an account by username or ID without personal data, and audits the lookup', async () => {
      const byHandle = await call(t, 'GET', '/v1/admin/users/lookup?q=%40AMMA', { token: analyst });
      expect(byHandle.status).toBe(200);
      expect(byHandle.body).toMatchObject({ id: user.id, handle: 'amma', locale: 'ta', status: 'active', signalConsent: true, passkeys: { active: 1, revoked: 0 } });
      expect(byHandle.body.devices).toHaveLength(1);
      expect(byHandle.body.recentStepups).toHaveLength(2);
      expect(JSON.stringify(byHandle.body)).not.toContain('Lakshmi');
      expect(JSON.stringify(byHandle.body)).not.toContain('Pixel');

      const byId = await call(t, 'GET', `/v1/admin/users/lookup?q=${user.id}`, { token: analyst });
      expect(byId.body.handle).toBe('amma');
      expect(await lastAudit('admin.user_viewed')).toMatchObject({ actorType: 'admin', subjectType: 'user', subjectId: user.id });
    });

    it('answers not found for unknown accounts', async () => {
      expect((await call(t, 'GET', '/v1/admin/users/lookup?q=nobody', { token: analyst })).status).toBe(404);
    });
  });

  describe('risk rules', () => {
    const rulesOf = async () => (await call(t, 'GET', '/v1/admin/risk/rules', { token: admin })).body;

    it('shows the active set with every rule and its history', async () => {
      const r = await rulesOf();
      expect(r.active.version).toBe(1);
      expect(r.active.rules.map((x: { key: string }) => x.key).sort()).toEqual(Object.keys(RISK_RULE_DEFAULTS).sort());
      expect(r.versions).toHaveLength(1);
    });

    it('previews the impact of a draft against recent step-ups', async () => {
      const { active } = await rulesOf();
      const res = await call(t, 'POST', '/v1/admin/risk/rules/preview', {
        token: analyst,
        body: { draft: { guardianThreshold: 50, rules: active.rules.map((x: { key: string }) => (x.key === 'remote_access_app' ? { ...x, enabled: false } : x)) } },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ assessed: 2, guardedBefore: 1, guardedAfter: 0, noLongerGuarded: 1, newlyGuarded: 0, activeVersion: 1, truncated: false });
    });

    it('refuses drafts that leave a rule out', async () => {
      const { active } = await rulesOf();
      const res = await call(t, 'POST', '/v1/admin/risk/rules', {
        token: admin,
        body: { baseVersion: 1, note: 'drop one', draft: { guardianThreshold: 50, rules: active.rules.slice(1) } },
      });
      expect(res.status).toBe(400);
    });

    it('publishes a new version that the next assessment uses, and refuses stale edits', async () => {
      const { active } = await rulesOf();
      const rules = active.rules.map((x: { key: string; weight: number }) => (x.key === 'call_unknown_number' ? { ...x, weight: 60 } : x));
      const body = { baseVersion: 1, note: 'Unknown callers weigh more', draft: { guardianThreshold: 45, rules } };
      const res = await call(t, 'POST', '/v1/admin/risk/rules', { token: admin, body });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);

      const audit = await lastAudit('risk.rules_published');
      expect(audit?.payload).toMatchObject({
        version: 2,
        previous: 1,
        threshold: 45,
        previousThreshold: 50,
        changes: [{ key: 'call_unknown_number', from: 40, to: 60, enabled: true }],
      });

      const again = await call(t, 'POST', '/v1/admin/risk/rules', { token: admin, body });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('RULES_CHANGED');

      const after = await rulesOf();
      expect(after.active).toMatchObject({ version: 2, guardianThreshold: 45, note: 'Unknown callers weigh more', createdBy: 'sec.lead' });
      expect(after.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
      expect((await call(t, 'GET', '/v1/admin/risk/rules/1', { token: analyst })).body.guardianThreshold).toBe(50);
      expect((await call(t, 'GET', '/v1/admin/risk/rules/9', { token: analyst })).status).toBe(404);

      // A call from an unknown number alone (60) now crosses the new threshold (45).
      const callOnly = { ...calmSignals(), call: { active: true, durationSec: 60, numberKnown: 'unknown' as const } };
      const s = await startStepup(t, user, 'raise_transfer_limit', raise, callOnly);
      expect(s.body.request).toMatchObject({ score: 60, needsGuardian: true });
    });
  });

  describe('tampering', () => {
    it('reports where the chain breaks and records the failure', async () => {
      const target = await t.deps.prisma.auditEvent.findFirstOrThrow({ where: { action: 'stepup.created' }, orderBy: { id: 'asc' } });
      // The append-only trigger stops ordinary writes; simulate a superuser who bypasses triggers.
      await t.deps.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
        await tx.$executeRaw`UPDATE audit_events SET payload = '{"action":"edited"}'::jsonb WHERE id = ${target.id}`;
      });
      const res = await call(t, 'POST', '/v1/admin/audit/verify', { token: admin });
      expect(res.body).toMatchObject({ ok: false, brokenAtId: target.id.toString(), reason: 'hash_mismatch' });
      expect((await lastAudit('audit.chain_broken'))?.payload).toMatchObject({ ok: false, brokenAtId: target.id.toString() });
    });
  });
});
