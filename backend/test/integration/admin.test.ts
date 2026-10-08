import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminInvite } from '../../src/modules/admin/admin-auth.routes.js';
import { defaultRuleSet } from '../../src/modules/risk/engine.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, login, registerUser } from '../helpers/client.js';
import { SoftAuthenticator } from '../helpers/soft-authenticator.js';

const csrf = { 'x-requested-with': 'cosign-dashboard' };

describe('security console APIs', () => {
  let t: TestApp;
  let admin: string;
  let analyst: string;
  let userId: string;

  async function staff(role: 'admin' | 'analyst', handle: string) {
    const { url } = await createAdminInvite({ deps: t.deps }, role, null);
    const auth = new SoftAuthenticator('http://localhost:5173');
    const start = await call(t, 'POST', '/v1/admin/auth/register/options', { body: { inviteToken: new URL(url).searchParams.get('invite'), handle, displayName: handle }, headers: csrf });
    const done = await call(t, 'POST', '/v1/admin/auth/register/verify', { body: { response: auth.create(start.body.options) }, headers: csrf });
    return done.body.accessToken as string;
  }

  beforeAll(async () => {
    t = await startTestApp();
    admin = await staff('admin', 'ops.admin');
    analyst = await staff('analyst', 'ops.analyst');
    const u = await registerUser(t, 'shanti', { displayName: 'Shanti' });
    userId = u.id;
    await login(t, u.authenticator, u.deviceId);
    await call(t, 'POST', '/v1/auth/login/verify', { body: { response: { id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: { clientDataJSON: 'AAAA', authenticatorData: 'AAAA', signature: 'AAAA' }, clientExtensionResults: {} }, device: { platform: 'android', name: 'x' } } });
  });
  afterAll(async () => {
    await t.close();
  });

  it('counts logins and failures from the audit log', async () => {
    const m = await call(t, 'GET', '/v1/admin/metrics', { token: analyst });
    expect(m.status).toBe(200);
    expect(m.body.counters.logins).toBeGreaterThanOrEqual(1);
    expect(m.body.counters.loginFailures).toBeGreaterThanOrEqual(1);
    expect(m.body.medianGuardianResponseMs).toBeNull();
    const ts = await call(t, 'GET', '/v1/admin/metrics/timeseries?bucket=hour', { token: analyst });
    expect(ts.body.series.length).toBeGreaterThan(24);
    expect(ts.body.series.reduce((n: number, p: { logins: number }) => n + p.logins, 0)).toBeGreaterThanOrEqual(1);
  });

  it('looks up users; analysts never see balances, admins do; every view is audited', async () => {
    const found = await call(t, 'GET', '/v1/admin/users?q=sha', { token: analyst });
    expect(found.body.users[0]).toMatchObject({ handle: 'shanti', displayName: 'Shanti' });
    const a = await call(t, 'GET', `/v1/admin/users/${userId}`, { token: analyst });
    expect(a.body.account).toBeNull();
    expect(JSON.stringify(a.body)).not.toContain('balanceMinor');
    const b = await call(t, 'GET', `/v1/admin/users/${userId}`, { token: admin });
    expect(b.body.account.balanceMinor).toBe('5000000');
    expect(await t.deps.prisma.auditEvent.count({ where: { action: 'admin.user_viewed', subjectId: userId } })).toBe(2);
  });

  it('publishes a new risk-rule version (admins only) and the engine uses it', async () => {
    const current = await call(t, 'GET', '/v1/admin/risk/rules', { token: analyst });
    const rules = current.body.active.rules.map((r: { key: string; weight: number }) => (r.key === 'late_night' ? { ...r, weight: 25 } : r));
    const denied = await call(t, 'POST', '/v1/admin/risk/rules', { token: analyst, body: { guardianThreshold: 55, rules } });
    expect(denied.status).toBe(403);
    const ok = await call(t, 'POST', '/v1/admin/risk/rules', { token: admin, body: { guardianThreshold: 55, rules, note: 'Night scams rising' } });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(current.body.active.version + 1);
    const active = await t.ctx.services.risk.activeRuleSet();
    expect(active.guardianThreshold).toBe(55);
    expect(active.rules.find((r) => r.key === 'late_night')!.weight).toBe(25);
    const versions = await call(t, 'GET', '/v1/admin/risk/rules', { token: analyst });
    expect(versions.body.versions[0]).toMatchObject({ createdBy: 'ops.admin', note: 'Night scams rising' });
    const old = await call(t, 'GET', `/v1/admin/risk/rules/${current.body.active.version}`, { token: analyst });
    expect(old.body.guardianThreshold).toBe(defaultRuleSet().guardianThreshold);
  });

  it('rejects invalid rule sets', async () => {
    const r = await call(t, 'POST', '/v1/admin/risk/rules', { token: admin, body: { guardianThreshold: 0, rules: [] } });
    expect(r.status).toBe(400);
  });

  it('lists, verifies and exports the audit chain', async () => {
    const page = await call(t, 'GET', '/v1/admin/audit?limit=5', { token: analyst });
    expect(page.body.events).toHaveLength(5);
    expect(page.body.nextBefore).toBeTruthy();
    const next = await call(t, 'GET', `/v1/admin/audit?limit=5&before=${page.body.nextBefore}`, { token: analyst });
    expect(BigInt(next.body.events[0].id)).toBeLessThan(BigInt(page.body.events[4].id));
    const filtered = await call(t, 'GET', '/v1/admin/audit?action=auth.login', { token: analyst });
    expect(filtered.body.events.every((e: { action: string }) => e.action.startsWith('auth.login'))).toBe(true);

    const v = await call(t, 'GET', '/v1/admin/audit/verify', { token: analyst });
    expect(v.body).toMatchObject({ ok: true });

    const csv = await t.app.inject({ method: 'GET', url: '/v1/admin/audit/export.csv', headers: { authorization: `Bearer ${analyst}` } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.body.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('id,created_at,actor_type,actor_id,action,subject_type,subject_id,payload,prev_hash,hash');
    expect(lines.length).toBeGreaterThan(5);
  });

  it('detects tampering with the chain', async () => {
    // Simulate an insider editing a row directly (bypassing the append-only trigger as a superuser would).
    await t.deps.prisma.$executeRawUnsafe('ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update');
    await t.deps.prisma.$executeRawUnsafe(`UPDATE audit_events SET payload = '{"tampered":true}' WHERE id = (SELECT min(id) + 1 FROM audit_events)`);
    await t.deps.prisma.$executeRawUnsafe('ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update');
    const v = await call(t, 'GET', '/v1/admin/audit/verify', { token: admin });
    expect(v.body.ok).toBe(false);
    expect(v.body.reason).toBe('hash_mismatch');
  });

  it('user tokens cannot reach the console APIs', async () => {
    const u = await registerUser(t, 'curious');
    expect((await call(t, 'GET', '/v1/admin/metrics', { token: u.accessToken })).status).toBe(401);
  });
});
