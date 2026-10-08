import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MONITOR_CONSENT_VERSION } from '../../src/modules/monitor/monitor.routes.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, registerUser, type TestUser } from '../helpers/client.js';
import { ageDevice, grantConsent, makeGuardian, startStepup } from '../helpers/flows.js';

const unknownCall = (durationSec = 600) => ({ active: true, durationSec, caller: 'unknown', repeatCount: 0 });
const ev = (over: Record<string, unknown>) => ({
  clientId: randomUUID().replace(/-/g, ''),
  occurredAt: new Date().toISOString(),
  app: null,
  amountBucket: null,
  call: null,
  localHour: 14,
  paused: false,
  ...over,
});

describe('family protection monitoring', () => {
  let t: TestApp;
  let elder: TestUser;
  let guardian: TestUser;
  let stranger: TestUser;
  let monitorToken: string;

  beforeAll(async () => {
    t = await startTestApp();
    elder = await registerUser(t, 'paati', { displayName: 'Paati', locale: 'ta' });
    guardian = await registerUser(t, 'karthik', { displayName: 'Karthik' });
    stranger = await registerUser(t, 'outsider');
    await makeGuardian(t, elder, guardian);
  });
  afterAll(async () => {
    await t.close();
  });

  it('refuses monitoring until the person on the phone consents', async () => {
    const r = await call(t, 'POST', '/v1/monitor/token', { token: elder.accessToken });
    expect(r.body.error.code).toBe('CONSENT_REQUIRED');
    const consent = await call(t, 'PUT', '/v1/monitor/consent', { token: elder.accessToken, body: { granted: true, version: MONITOR_CONSENT_VERSION } });
    expect(consent.status).toBe(204);
    const ok = await call(t, 'POST', '/v1/monitor/token', { token: elder.accessToken });
    expect(ok.status).toBe(200);
    monitorToken = ok.body.token;
    const status = await call(t, 'GET', '/v1/monitor/status', { token: elder.accessToken });
    expect(status.body).toMatchObject({ consented: true, enabledOnThisPhone: true, guardians: 1 });
  });

  it('the monitor token can only upload events, nothing else', async () => {
    const me = await call(t, 'GET', '/v1/me', { headers: { 'x-monitor-token': monitorToken } });
    expect(me.status).toBe(401);
    const bad = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': 'x'.repeat(43) }, body: { events: [ev({ kind: 'call_update' })] } });
    expect(bad.status).toBe(401);
  });

  it('a calm event is stored but nobody is alerted', async () => {
    const before = t.push.forUser(guardian.id).length;
    const r = await call(t, 'POST', '/v1/monitor/events', {
      headers: { 'x-monitor-token': monitorToken },
      body: { events: [ev({ kind: 'app_foreground', app: { package: 'com.sbi.lotusintouch', category: 'bank' } })] },
    });
    expect(r.body.results[0]).toMatchObject({ severity: 'info', score: 0 });
    expect(t.push.forUser(guardian.id).length).toBe(before);
  });

  it('a UPI PIN screen during an unknown call pauses the phone and alerts the guardian in their language', async () => {
    const r = await call(t, 'POST', '/v1/monitor/events', {
      headers: { 'x-monitor-token': monitorToken },
      body: { events: [ev({ kind: 'payment_screen', app: { package: 'com.phonepe.app', category: 'upi' }, call: unknownCall(), paused: true })] },
    });
    const res = r.body.results[0];
    expect(res).toMatchObject({ severity: 'critical', score: 70, pause: true, rules: ['payment_screen_during_call'] });
    expect(res.pauseId).toBeTruthy();

    const pushes = t.push.forUser(guardian.id);
    expect(pushes.some((m) => m.type === 'monitor_paused' && m.title.includes('Paati'))).toBe(true);

    const alerts = await call(t, 'GET', '/v1/guardian/alerts', { token: guardian.accessToken });
    const alert = alerts.body.alerts[0];
    expect(alert).toMatchObject({ severity: 'critical', person: { displayName: 'Paati' }, app: { category: 'upi', package: 'com.phonepe.app' }, pause: { status: 'active' } });
    expect(alert.reasons[0].reason).toMatch(/PIN/);
    // Nothing personal leaves the phone: no numbers and no message text.
    expect(JSON.stringify(alerts.body)).not.toMatch(/\+91|OTP is/);

    // The phone polls the pause; the guardian releases it after calling.
    const poll = await call(t, 'GET', `/v1/monitor/pauses/${res.pauseId}`, { headers: { 'x-monitor-token': monitorToken } });
    expect(poll.body.status).toBe('active');
    expect((await call(t, 'POST', `/v1/guardian/pauses/${res.pauseId}/release`, { token: stranger.accessToken })).status).toBe(404);
    expect((await call(t, 'POST', `/v1/guardian/pauses/${res.pauseId}/release`, { token: guardian.accessToken })).status).toBe(204);
    const after = await call(t, 'GET', `/v1/monitor/pauses/${res.pauseId}`, { headers: { 'x-monitor-token': monitorToken } });
    expect(after.body.status).toBe('released');
  });

  it('the person can always continue after the countdown (never a permanent lockout)', async () => {
    const r = await call(t, 'POST', '/v1/monitor/events', {
      headers: { 'x-monitor-token': monitorToken },
      body: { events: [ev({ kind: 'notification_otp', call: unknownCall(120), paused: true })] },
    });
    const pauseId = r.body.results[0].pauseId;
    expect((await call(t, 'POST', `/v1/monitor/pauses/${pauseId}/dismiss`, { headers: { 'x-monitor-token': monitorToken } })).status).toBe(204);
    expect((await call(t, 'GET', `/v1/monitor/pauses/${pauseId}`, { headers: { 'x-monitor-token': monitorToken } })).body.status).toBe('dismissed');
  });

  it('retried uploads are not double counted', async () => {
    const e = ev({ kind: 'notification_login', app: { package: 'com.instagram.android', category: 'social' } });
    await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [e] } });
    await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [e] } });
    expect(await t.deps.prisma.monitorEvent.count({ where: { clientId: e.clientId as string } })).toBe(1);
  });

  it('learns the usual payment size: a debit far above it is flagged as unusual', async () => {
    const debit = (bucket: string) => ev({ kind: 'notification_debit', app: { package: 'com.sbi.lotusintouch', category: 'bank' }, amountBucket: bucket });
    await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [debit('1k_10k'), debit('1k_10k'), debit('lt_1k')] } });
    const big = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [debit('50k_1l')] } });
    expect(big.body.results[0].rules).toEqual(['unusual_debit', 'large_debit']);
    const usual = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [debit('1k_10k')] } });
    expect(usual.body.results[0].rules).toEqual([]);
  });

  it('scores the newer scam signals and keeps only their non-sensitive extra facts', async () => {
    const r = await call(t, 'POST', '/v1/monitor/events', {
      headers: { 'x-monitor-token': monitorToken },
      body: {
        events: [
          ev({ kind: 'screen_share_prompt', call: unknownCall(200), paused: true }),
          ev({ kind: 'app_installed', app: { package: 'com.anydesk.anydeskandroid', category: 'remote_access' }, installer: 'unknown' }),
          ev({ kind: 'unlock_failed', attempts: 4 }),
          ev({ kind: 'app_foreground', app: { package: 'com.whatsapp', category: 'messaging' }, sinceOtpSec: 30 }),
        ],
      },
    });
    const byRule = (k: string) => r.body.results.find((x: { rules: string[] }) => x.rules[0] === k);
    expect(byRule('screen_share_started')).toMatchObject({ severity: 'critical', pause: true });
    expect(byRule('remote_access_installed').rules).toEqual(['remote_access_installed', 'sideloaded_app_installed']);
    expect(byRule('repeated_unlock_failures').severity).toBe('warn');
    expect(byRule('chat_after_otp').score).toBe(40);
    const unlock = await t.deps.prisma.monitorEvent.findFirstOrThrow({ where: { userId: elder.id, kind: 'unlock_failed' } });
    expect(unlock.detail).toEqual({ attempts: 4 });
    // Extra fields that could carry personal data are refused.
    const bad = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [ev({ kind: 'unlock_failed', attempts: 4, pin: '1234' })] } });
    expect(bad.status).toBe(200);
    expect(JSON.stringify(await t.deps.prisma.monitorEvent.findMany({ where: { userId: elder.id } }))).not.toContain('1234');
  });

  it('pause notifications carry one-tap buttons in the guardian language, tied to the person', async () => {
    const push = t.push
      .forUser(guardian.id)
      .filter((m) => m.type === 'monitor_paused')
      .at(-1)!;
    const link = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: elder.id, guardianId: guardian.id } });
    expect(push.data.linkId).toBe(link.id);
    expect(JSON.parse(push.data.actions!)).toEqual([
      { id: 'release', label: 'Let them continue' },
      { id: 'open', label: 'Open' },
    ]);
  });

  it('a guardian can pause the phone now; the phone sees it on its next poll; strangers cannot', async () => {
    const people = await call(t, 'GET', '/v1/guardian/people', { token: guardian.accessToken });
    const person = people.body.people.find((p: { handle: string }) => p.handle === 'paati');
    expect(person.protection).toMatchObject({ on: true, lastAlert: { severity: expect.any(String) } });
    expect((await call(t, 'POST', `/v1/guardian/people/${person.linkId}/pause`, { token: stranger.accessToken })).status).toBe(404);

    const paused = await call(t, 'POST', `/v1/guardian/people/${person.linkId}/pause`, { token: guardian.accessToken });
    expect(paused.status).toBe(200);
    expect(paused.body.pauseIds).toHaveLength(1);
    const cmd = await call(t, 'GET', '/v1/monitor/commands', { headers: { 'x-monitor-token': monitorToken } });
    expect(cmd.body).toMatchObject({ pause: { id: paused.body.pauseIds[0], byGuardian: true, rules: ['guardian_paused'] }, lock: false });
    const again = await call(t, 'GET', '/v1/guardian/people', { token: guardian.accessToken });
    expect(again.body.people.find((p: { handle: string }) => p.handle === 'paati').protection.activePause).toMatchObject({ byGuardian: true });
  });

  it('the paused person can ask to continue, and the guardian lets them with one tap', async () => {
    const { pause } = (await call(t, 'GET', '/v1/monitor/commands', { headers: { 'x-monitor-token': monitorToken } })).body;
    const before = t.push.forUser(guardian.id).length;
    expect((await call(t, 'POST', `/v1/monitor/pauses/${pause.id}/ask`, { headers: { 'x-monitor-token': monitorToken } })).status).toBe(204);
    // Asking again straight away does not flood the guardian.
    expect((await call(t, 'POST', `/v1/monitor/pauses/${pause.id}/ask`, { headers: { 'x-monitor-token': monitorToken } })).status).toBe(204);
    const asks = t.push.forUser(guardian.id).slice(before).filter((m) => m.type === 'monitor_release_ask');
    expect(asks).toHaveLength(1);
    expect(asks[0]!.data).toMatchObject({ screen: 'guardian_pause', pauseId: pause.id });
    expect(JSON.parse(asks[0]!.data.actions!).map((a: { id: string }) => a.id)).toEqual(['release', 'open']);

    const view = await call(t, 'GET', `/v1/guardian/pauses/${pause.id}`, { token: guardian.accessToken });
    expect(view.body).toMatchObject({ status: 'active', byGuardian: true, person: { displayName: 'Paati' }, reasons: [{ key: 'guardian_paused' }] });
    expect((await call(t, 'GET', `/v1/guardian/pauses/${pause.id}`, { token: stranger.accessToken })).status).toBe(404);
    expect((await call(t, 'POST', `/v1/guardian/pauses/${pause.id}/release`, { token: guardian.accessToken })).status).toBe(204);
    expect((await call(t, 'GET', '/v1/monitor/commands', { headers: { 'x-monitor-token': monitorToken } })).body.pause).toBeNull();
  });

  it('a lock command is delivered to the phone exactly once', async () => {
    const link = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: elder.id, guardianId: guardian.id } });
    expect((await call(t, 'POST', `/v1/guardian/people/${link.id}/lock`, { token: stranger.accessToken })).status).toBe(404);
    expect((await call(t, 'POST', `/v1/guardian/people/${link.id}/lock`, { token: guardian.accessToken })).body).toEqual({ devices: 1 });
    expect((await call(t, 'GET', '/v1/monitor/commands', { headers: { 'x-monitor-token': monitorToken } })).body.lock).toBe(true);
    expect((await call(t, 'GET', '/v1/monitor/commands', { headers: { 'x-monitor-token': monitorToken } })).body.lock).toBe(false);
  });

  it('"I need help" reaches every guardian with a way straight back to the person', async () => {
    const link = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: elder.id, guardianId: guardian.id } });
    expect((await call(t, 'POST', '/v1/monitor/help', { token: elder.accessToken })).status).toBe(204);
    const help = t.push.forUser(guardian.id).filter((m) => m.type === 'monitor_help');
    expect(help).toHaveLength(1);
    expect(help[0]!.title).toContain('Paati');
    expect(help[0]!.data).toMatchObject({ screen: 'guardian_person', linkId: link.id });
  });

  it('the protected person sees their own warnings, in their own language', async () => {
    const mine = await call(t, 'GET', '/v1/monitor/mine', { token: elder.accessToken });
    expect(mine.status).toBe(200);
    const share = mine.body.alerts.find((a: { kind: string }) => a.kind === 'screen_share_prompt');
    expect(share.reasons[0].reason).toMatch(/[஀-௿]/);
    expect(mine.body.alerts.every((a: { severity: string }) => a.severity !== 'info')).toBe(true);
  });

  it('a recent critical alert makes Co-Sign actions riskier (step-up gets a guardian)', async () => {
    await grantConsent(t, elder);
    await ageDevice(t, elder);
    const start = await startStepup(t, elder, 'change_email', { email: 'elder@mail.test' });
    expect(start.body.request.reasons.map((r: { key: string }) => r.key)).toContain('recent_family_alert');
  });

  it('withdrawing consent stops uploads immediately', async () => {
    await call(t, 'PUT', '/v1/monitor/consent', { token: elder.accessToken, body: { granted: false, version: MONITOR_CONSENT_VERSION } });
    const r = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [ev({ kind: 'call_update', call: unknownCall() })] } });
    expect(r.status).toBe(401);
    // With protection off, the guardian is told plainly instead of pausing nothing.
    const link = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: elder.id, guardianId: guardian.id } });
    const pause = await call(t, 'POST', `/v1/guardian/people/${link.id}/pause`, { token: guardian.accessToken });
    expect(pause.status).toBe(409);
    expect(pause.body.error.code).toBe('PROTECTION_OFF');
  });

  it('every alert, pause and guardian control is in the audit chain', async () => {
    const actions = (await t.deps.prisma.auditEvent.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of [
      'monitor.enabled',
      'monitor.pause_started',
      'monitor.pause_released',
      'monitor.pause_dismissed',
      'monitor.alert',
      'monitor.guardian_paused',
      'monitor.guardian_locked',
      'monitor.release_asked',
      'monitor.help_requested',
    ])
      expect(actions).toContain(a);
    expect((await t.deps.audit.verifyChain()).ok).toBe(true);
  });
});
