import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, registerUser, type TestUser } from '../helpers/client.js';
import { ageDevice, calmSignals, grantConsent, guardianDecide, makeGuardian, scamSignals, startStepup, stepup, tick } from '../helpers/flows.js';

describe('step-up co-sign end to end', () => {
  let t: TestApp;
  let user: TestUser;
  let g1: TestUser;
  let g2: TestUser;
  let n = 0;

  beforeAll(async () => {
    t = await startTestApp();
    user = await registerUser(t, 'amma', { displayName: 'Amma', locale: 'ta' });
    g1 = await registerUser(t, 'son', { displayName: 'Son' });
    g2 = await registerUser(t, 'daughter', { displayName: 'Daughter', locale: 'hi' });
    for (const u of [user, g1, g2]) {
      await grantConsent(t, u);
      await ageDevice(t, u);
    }
    await makeGuardian(t, user, g1);
    await makeGuardian(t, user, g2);
  });
  afterAll(async () => {
    await t.close();
  });

  // Changing the sign-in email is a classic takeover step, so it is risk-scored and co-signed.
  const newEmail = () => ({ email: `amma.${++n}@mail.test` });

  it('low risk: the user passkey alone completes the action', async () => {
    const { start, verify } = await stepup(t, user, 'change_email', { email: 'amma.home@mail.test' }, calmSignals());
    expect(start.body.request).toMatchObject({ status: 'pending_user', needsGuardian: false, score: 0 });
    expect(verify.body.status).toBe('completed');
    const row = await t.deps.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.emailHash).toBe(t.deps.blind.of('email', 'amma.home@mail.test'));
  });

  it('high risk: explains why in the user language and pauses for a guardian', async () => {
    const { start, verify, id } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    expect(start.body.request.score).toBe(70);
    expect(start.body.request.needsGuardian).toBe(true);
    // The user chose Tamil: reasons and the action label are in Tamil.
    expect(start.body.request.reasons.map((r: { key: string }) => r.key)).toEqual(['call_unknown_number', 'remote_access_app']);
    expect(start.body.request.reasons[0].reason).toMatch(/[஀-௿]/);
    expect(verify.body.status).toBe('pending_guardians');

    // Guardians are told immediately (push), and see only the request, in their own language.
    const push = t.push.forUser(g1.id).find((m) => m.type === 'guardian_request' && m.data.requestId === id)!;
    expect(push).toBeTruthy();
    // One-tap buttons on the notification; each still needs the guardian's own passkey.
    expect(JSON.parse(push.data.actions!).map((a: { id: string }) => a.id)).toEqual(['approve', 'deny']);
    const inbox = await call(t, 'GET', '/v1/guardian/inbox', { token: g2.accessToken, headers: { 'accept-language': 'hi' } });
    const item = inbox.body.requests.find((r: { id: string }) => r.id === id);
    expect(item).toMatchObject({ score: 70, requester: { displayName: 'Amma' }, action: 'change_email' });
    expect(item.reasons[0].reason).toMatch(/[ऀ-ॿ]/);
    // The guardian sees what is being changed, never the new address itself.
    expect(JSON.stringify(item)).not.toContain('@mail.test');

    const approve = await guardianDecide(t, g1, id, 'approve');
    expect(approve.status).toBe(200);
    expect(approve.body.decision).toBe('approve');
    const view = await call(t, 'GET', `/v1/stepup/${id}`, { token: user.accessToken });
    expect(view.body.status).toBe('completed');
    const decision = await t.deps.prisma.guardianDecision.findFirstOrThrow({ where: { requestId: id } });
    expect(decision.responseMs).toBeGreaterThanOrEqual(0);
  });

  it('one denial cancels the request and the user is told why', async () => {
    const { id, verify } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    expect(verify.body.status).toBe('pending_guardians');
    const deny = await guardianDecide(t, g2, id, 'deny');
    expect(deny.body.decision).toBe('deny');
    const view = await call(t, 'GET', `/v1/stepup/${id}`, { token: user.accessToken, headers: { 'x-cosign-lang': 'en' } });
    expect(view.body.status).toBe('denied');
    expect(view.body.failure.code).toBe('GUARDIAN_DENIED');
    expect(view.body.failure.next).toMatch(/call your guardian/i);
    // The other guardian can no longer act on it.
    const late = await guardianDecide(t, g1, id, 'approve');
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REQUEST_ALREADY_DECIDED');
  });

  it('a guardian approval is bound to one request and cannot be replayed', async () => {
    const a = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    const b = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    // Signature made for request A...
    const optsA = await call(t, 'POST', `/v1/guardian/requests/${a.id}/options`, { token: g1.accessToken, body: { decision: 'approve' } });
    const sigA = g1.authenticator.get(optsA.body.options);
    // ...cannot approve request B.
    const wrong = await call(t, 'POST', `/v1/guardian/requests/${b.id}/decision`, { token: g1.accessToken, body: { response: sigA } });
    expect(wrong.status).toBe(401);
    // And the consumed challenge cannot be used again for A either (single use).
    const replay = await call(t, 'POST', `/v1/guardian/requests/${a.id}/decision`, { token: g1.accessToken, body: { response: sigA } });
    expect(replay.status).toBe(401);
    await call(t, 'POST', `/v1/stepup/${a.id}/cancel`, { token: user.accessToken });
    await call(t, 'POST', `/v1/stepup/${b.id}/cancel`, { token: user.accessToken });
  });

  it('a guardian cannot approve with the protected user\'s own passkey', async () => {
    const { id } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    const opts = await call(t, 'POST', `/v1/guardian/requests/${id}/options`, { token: g1.accessToken, body: { decision: 'approve' } });
    // The scammer coaches the user to "approve" on their own phone: the credential is not the guardian's.
    const forged = user.authenticator.get({ ...opts.body.options, allowCredentials: [] });
    const r = await call(t, 'POST', `/v1/guardian/requests/${id}/decision`, { token: g1.accessToken, body: { response: forged } });
    expect(r.status).toBe(401);
    await call(t, 'POST', `/v1/stepup/${id}/cancel`, { token: user.accessToken });
  });

  it('non-guardians cannot see or decide requests', async () => {
    const stranger = await registerUser(t, 'stranger');
    const { id } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    expect((await call(t, 'GET', `/v1/guardian/requests/${id}`, { token: stranger.accessToken })).status).toBe(404);
    expect((await guardianDecide(t, stranger, id, 'approve')).status).toBe(404);
    await call(t, 'POST', `/v1/stepup/${id}/cancel`, { token: user.accessToken });
  });

  it('no answer before expiry starts a cool-off, then the user confirms with their passkey', async () => {
    const { id } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    await t.deps.prisma.stepupRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await tick(t);
    let view = await call(t, 'GET', `/v1/stepup/${id}`, { token: user.accessToken });
    expect(view.body.status).toBe('cooloff');
    expect(new Date(view.body.coolOffUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(t.push.forUser(user.id).some((m) => m.type === 'cooloff_started')).toBe(true);

    // During the cool-off the action cannot be forced through, and the reason is explained.
    const opts = await call(t, 'POST', `/v1/stepup/${id}/options`, { token: user.accessToken });
    expect(opts.status).toBe(409);

    await t.deps.prisma.stepupRequest.update({ where: { id }, data: { coolOffUntil: new Date(Date.now() - 1000) } });
    await tick(t);
    view = await call(t, 'GET', `/v1/stepup/${id}`, { token: user.accessToken });
    expect(view.body.status).toBe('ready_to_confirm');
    const confirm = await call(t, 'POST', `/v1/stepup/${id}/options`, { token: user.accessToken });
    const done = await call(t, 'POST', `/v1/stepup/${id}/verify`, { token: user.accessToken, body: { response: user.authenticator.get(confirm.body.options) } });
    expect(done.body.status).toBe('completed');
  });

  it('with no guardians a high-risk action goes straight to a cool-off the user can cancel', async () => {
    const solo = await registerUser(t, 'solo');
    await grantConsent(t, solo);
    await ageDevice(t, solo);
    const { verify, id } = await stepup(t, solo, 'change_email', { email: 'solo@mail.test' }, scamSignals());
    expect(verify.body.status).toBe('cooloff');
    const cancel = await call(t, 'POST', `/v1/stepup/${id}/cancel`, { token: solo.accessToken });
    expect(cancel.body.status).toBe('cancelled');
  });

  it('without consent, device signals are ignored (fewer signals, never more power)', async () => {
    const quiet = await registerUser(t, 'quiet');
    await ageDevice(t, quiet);
    const start = await startStepup(t, quiet, 'change_email', { email: 'quiet@mail.test' }, scamSignals());
    expect(start.body.request.score).toBe(0);
  });

  it('server-side facts still count without consent: a brand-new device adds points', async () => {
    const fresh = await registerUser(t, 'fresh');
    const start = await startStepup(t, fresh, 'change_email', { email: 'fresh@mail.test' });
    expect(start.body.request.reasons.map((r: { key: string }) => r.key)).toEqual(['new_device_24h']);
  });

  it('streams live updates to the waiting screen over Socket.io', async () => {
    const socket = ioClient(t.url, { auth: { token: user.accessToken }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const updated = new Promise<{ status: string }>((resolve) => socket.on('stepup.updated', resolve));
    const { id } = await stepup(t, user, 'change_email', newEmail(), scamSignals());
    expect((await updated).status).toBe('pending_guardians');
    const next = new Promise<{ status: string; requestId: string }>((resolve) => socket.on('stepup.updated', (e) => e.status === 'completed' && resolve(e)));
    await guardianDecide(t, g2, id, 'approve');
    expect((await next).requestId).toBe(id);
    socket.disconnect();
  });

  it('one-time results (recovery codes) are released once, only to the phone that asked', async () => {
    const { verify, id } = await stepup(t, user, 'view_recovery_codes', {}, calmSignals());
    expect(verify.body.result.codes).toHaveLength(10);
    const again = await call(t, 'GET', `/v1/stepup/${id}`, { token: user.accessToken });
    expect(again.body.result).toBeNull();
    expect(await t.deps.prisma.recoveryCode.count({ where: { userId: user.id } })).toBe(10);
  });

  it('removing a guardian is sensitive and then waits 24 hours, with alerts', async () => {
    const link = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: user.id, guardianId: g2.id } });
    const { verify } = await stepup(t, user, 'remove_guardian', { linkId: link.id }, calmSignals());
    expect(verify.body.status).toBe('completed');
    const after = await t.deps.prisma.guardianLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(after.status).toBe('pending_removal');
    expect(after.removesAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    // The user can stop the change at once.
    const undo = await call(t, 'POST', `/v1/guardians/${link.id}/cancel-change`, { token: user.accessToken });
    expect(undo.status).toBe(204);
    expect((await t.deps.prisma.guardianLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe('active');
  });

  it('records every step in a valid hash chain', async () => {
    const v = await t.deps.audit.verifyChain();
    expect(v.ok).toBe(true);
    const actions = (await t.deps.prisma.auditEvent.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['stepup.created', 'stepup.awaiting_guardians', 'stepup.guardian_approved', 'stepup.guardian_denied', 'stepup.cooloff_started', 'stepup.completed']) {
      expect(actions).toContain(a);
    }
  });
});
