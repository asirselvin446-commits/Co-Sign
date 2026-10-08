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
    // Nothing personal leaves the phone: no numbers, no message text, no balances.
    expect(JSON.stringify(alerts.body)).not.toMatch(/\+91|balance|OTP is/);

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

  it('a recent critical alert makes Co-Sign actions riskier (step-up gets a guardian)', async () => {
    await grantConsent(t, elder);
    await ageDevice(t, elder);
    const start = await startStepup(t, elder, 'raise_transfer_limit', { newLimitMinor: '2000000' });
    expect(start.body.request.reasons.map((r: { key: string }) => r.key)).toContain('recent_family_alert');
  });

  it('withdrawing consent stops uploads immediately', async () => {
    await call(t, 'PUT', '/v1/monitor/consent', { token: elder.accessToken, body: { granted: false, version: MONITOR_CONSENT_VERSION } });
    const r = await call(t, 'POST', '/v1/monitor/events', { headers: { 'x-monitor-token': monitorToken }, body: { events: [ev({ kind: 'call_update', call: unknownCall() })] } });
    expect(r.status).toBe(401);
  });

  it('every alert and pause is in the audit chain', async () => {
    const actions = (await t.deps.prisma.auditEvent.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['monitor.enabled', 'monitor.pause_started', 'monitor.pause_released', 'monitor.pause_dismissed', 'monitor.alert']) expect(actions).toContain(a);
    expect((await t.deps.audit.verifyChain()).ok).toBe(true);
  });
});
