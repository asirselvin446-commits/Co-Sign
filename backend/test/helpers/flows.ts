import { runJobsOnce } from '../../src/jobs/scheduler.js';
import type { DeviceSignals } from '../../src/modules/risk/engine.js';
import { CONSENT_VERSION } from '../../src/modules/risk/signals.routes.js';
import type { TestApp } from './app.js';
import { call, type TestUser } from './client.js';

export const calmSignals = (): DeviceSignals => ({
  collectedAt: new Date().toISOString(),
  platform: 'android',
  call: { active: false, durationSec: 0, numberKnown: 'unavailable' },
  remoteAccess: { installed: false, active: false },
  screen: { captureDetected: false, recordingActive: false },
  behaviour: { codePasted: false, localHour: 14 },
});

/** Unknown caller (+40) and a remote-control app (+30): score 70, guardian required. */
export const scamSignals = (): DeviceSignals => ({
  ...calmSignals(),
  call: { active: true, durationSec: 840, numberKnown: 'unknown' },
  remoteAccess: { installed: true, active: true },
});

export async function grantConsent(t: TestApp, u: TestUser): Promise<void> {
  const r = await call(t, 'PUT', '/v1/consents/risk-signals', { token: u.accessToken, body: { granted: true, version: CONSENT_VERSION } });
  if (r.status !== 204) throw new Error(`consent failed ${JSON.stringify(r.body)}`);
}

/** Pretend the account's phone was enrolled long ago, so "new device" does not add points. */
export async function ageDevice(t: TestApp, u: TestUser): Promise<void> {
  await t.deps.prisma.device.update({ where: { id: u.deviceId }, data: { enrolledAt: new Date(Date.now() - 30 * 24 * 3600_000) } });
}

export async function startStepup(t: TestApp, u: TestUser, action: string, params: Record<string, unknown> = {}, signals?: DeviceSignals) {
  return call(t, 'POST', '/v1/stepup', { token: u.accessToken, body: { action, params, ...(signals ? { signals } : {}) } });
}

/** Start a step-up and confirm it with the user's own passkey. */
export async function stepup(t: TestApp, u: TestUser, action: string, params: Record<string, unknown> = {}, signals?: DeviceSignals) {
  const start = await startStepup(t, u, action, params, signals);
  if (start.status !== 200) throw new Error(`stepup start failed: ${JSON.stringify(start.body)}`);
  const response = u.authenticator.get(start.body.options);
  const verify = await call(t, 'POST', `/v1/stepup/${start.body.request.id}/verify`, { token: u.accessToken, body: { response } });
  return { start, verify, id: start.body.request.id as string };
}

/** Invite, accept and fast-forward the 24-hour activation delay. */
export async function makeGuardian(t: TestApp, user: TestUser, guardian: TestUser): Promise<string> {
  const invite = await call(t, 'POST', '/v1/guardians/invites', { token: user.accessToken });
  const token = new URL(invite.body.url).pathname.split('/').pop()!;
  const accepted = await call(t, 'POST', '/v1/guardian/invites/accept', { token: guardian.accessToken, body: { token } });
  if (accepted.status !== 200) throw new Error(`accept failed ${JSON.stringify(accepted.body)}`);
  await t.deps.prisma.guardianLink.update({ where: { id: accepted.body.linkId }, data: { activatesAt: new Date(Date.now() - 1000) } });
  await t.ctx.services.guardians.applyDueChanges();
  return accepted.body.linkId;
}

export async function guardianDecide(t: TestApp, guardian: TestUser, requestId: string, decision: 'approve' | 'deny') {
  const opts = await call(t, 'POST', `/v1/guardian/requests/${requestId}/options`, { token: guardian.accessToken, body: { decision } });
  if (opts.status !== 200) return opts;
  const response = guardian.authenticator.get(opts.body.options);
  return call(t, 'POST', `/v1/guardian/requests/${requestId}/decision`, { token: guardian.accessToken, body: { response } });
}

export async function addPayee(t: TestApp, u: TestUser, handle: string, nickname = handle): Promise<string> {
  const { verify } = await stepup(t, u, 'add_payee', { handle, nickname }, calmSignals());
  if (verify.body.status !== 'completed') throw new Error(`add payee: ${JSON.stringify(verify.body)}`);
  return verify.body.result.payeeId;
}

export const tick = (t: TestApp) => runJobsOnce(t.ctx);
