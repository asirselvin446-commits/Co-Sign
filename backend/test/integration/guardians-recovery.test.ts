import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { appOrigin, call, randomIp, registerUser, type TestUser } from '../helpers/client.js';
import { SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { ageDevice, calmSignals, grantConsent, makeGuardian, stepup, tick } from '../helpers/flows.js';

const newPhone = { platform: 'android', name: 'Redmi Note' };

describe('guardian invites', () => {
  let t: TestApp;
  let user: TestUser;
  beforeAll(async () => {
    t = await startTestApp();
    user = await registerUser(t, 'lakshmi', { displayName: 'Lakshmi' });
  });
  afterAll(async () => {
    await t.close();
  });

  it('accepts by link or 8-digit code, and the guardian starts at once with an alert', async () => {
    const g = await registerUser(t, 'raj');
    const invite = await call(t, 'POST', '/v1/guardians/invites', { token: user.accessToken });
    expect(invite.body.code).toMatch(/^\d{8}$/);
    const preview = await call(t, 'POST', '/v1/guardian/invites/preview', { token: g.accessToken, body: { code: invite.body.code } });
    expect(preview.body.inviter.displayName).toBe('Lakshmi');
    const accept = await call(t, 'POST', '/v1/guardian/invites/accept', { token: g.accessToken, body: { code: invite.body.code } });
    expect(accept.status).toBe(200);
    expect(accept.body.active).toBe(true);
    expect(new Date(accept.body.activatesAt).getTime()).toBeLessThanOrEqual(Date.now());
    // The person is told at once, in words that say it has already happened.
    const told = t.push.forUser(user.id).find((m) => m.type === 'guardian_started');
    expect(told?.title).toContain('is now your guardian');
    const list = await call(t, 'GET', '/v1/guardians', { token: user.accessToken });
    expect(list.body.guardians[0]).toMatchObject({ handle: 'raj', status: 'active' });
    expect(new Date(list.body.guardians[0].undoUntil).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    // They can act as a guardian straight away.
    const people = await call(t, 'GET', '/v1/guardian/people', { token: g.accessToken });
    expect(people.body.people[0]).toMatchObject({ displayName: 'Lakshmi', status: 'active' });
    // A link already used cannot be reused.
    const again = await call(t, 'POST', '/v1/guardian/invites/accept', { token: g.accessToken, body: { code: invite.body.code } });
    expect(again.status).toBe(400);
  });

  it('explains codes typed in Tamil or Devanagari digits and offers the converted code', async () => {
    const g = await registerUser(t, 'tamilcode');
    const invite = await call(t, 'POST', '/v1/guardians/invites', { token: user.accessToken });
    const tamil = invite.body.code.replace(/\d/g, (d: string) => String.fromCharCode(0x0be6 + Number(d)));
    const r = await call(t, 'POST', '/v1/guardian/invites/preview', { token: g.accessToken, body: { code: tamil } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('CODE_NON_ASCII_DIGITS');
    expect(r.body.error.converted).toBe(invite.body.code);
  });

  it('limits wrong codes and states the exact wait', async () => {
    const g = await registerUser(t, 'guesser');
    let last;
    for (let i = 0; i < 6; i++) {
      last = await call(t, 'POST', '/v1/guardian/invites/preview', { token: g.accessToken, body: { code: String(10_000_000 + i) } });
    }
    expect(last!.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(last!.body.error.params.wait).toMatch(/minute/);
  });

  it('refuses self-guarding and enforces the maximum of five', async () => {
    const self = await call(t, 'POST', '/v1/guardians/invites', { token: user.accessToken });
    const r = await call(t, 'POST', '/v1/guardian/invites/accept', { token: user.accessToken, body: { code: self.body.code } });
    expect(r.body.error.code).toBe('CANNOT_GUARD_SELF');
    for (let i = 0; i < 4; i++) await makeGuardian(t, user, await registerUser(t, `g${i}x`));
    const full = await call(t, 'POST', '/v1/guardians/invites', { token: user.accessToken });
    expect(full.body.error.code).toBe('GUARDIAN_LIMIT_REACHED');
  });

  it('a new guardian can be undone instantly for a day, and everyone concerned is told', async () => {
    const kamala = await registerUser(t, 'kamala', { displayName: 'Kamala' });
    const first = await registerUser(t, 'firstg', { displayName: 'First' });
    const second = await registerUser(t, 'secondg', { displayName: 'Second' });
    await makeGuardian(t, kamala, first);
    const secondLink = await makeGuardian(t, kamala, second);
    // The existing guardian hears about the new one straight away.
    const joined = t.push.forUser(first.id).find((m) => m.type === 'guardian_joined');
    expect(joined?.body).toContain('Second');

    // "I did not add them": removed at once, no 24-hour wait, and the removed guardian is told.
    const undo = await call(t, 'POST', `/v1/guardians/${secondLink}/cancel-change`, { token: kamala.accessToken });
    expect(undo.status).toBe(204);
    expect((await t.deps.prisma.guardianLink.findUniqueOrThrow({ where: { id: secondLink } })).status).toBe('cancelled');
    expect(t.push.forUser(second.id).some((m) => m.type === 'guardian_undone' && m.title.includes('Kamala'))).toBe(true);
    expect((await call(t, 'GET', '/v1/guardian/people', { token: second.accessToken })).body.people).toHaveLength(0);

    // After the first day, removing a guardian is a protected action with the usual 24-hour wait.
    const firstLink = await t.deps.prisma.guardianLink.findFirstOrThrow({ where: { userId: kamala.id, guardianId: first.id } });
    await t.deps.prisma.guardianLink.update({ where: { id: firstLink.id }, data: { activatedAt: new Date(Date.now() - 25 * 3600_000) } });
    const late = await call(t, 'POST', `/v1/guardians/${firstLink.id}/cancel-change`, { token: kamala.accessToken });
    expect(late.status).toBe(404);
    const list = await call(t, 'GET', '/v1/guardians', { token: kamala.accessToken });
    expect(list.body.guardians.find((g: { handle: string }) => g.handle === 'firstg').undoUntil).toBeNull();
  });

  it('guardians still waiting under the old 24-hour rule start at once', async () => {
    const owner = await registerUser(t, 'oldrule');
    const g = await registerUser(t, 'oldruleg');
    const link = await t.deps.prisma.guardianLink.create({
      data: { userId: owner.id, guardianId: g.id, status: 'pending_activation', activatesAt: new Date(Date.now() + 20 * 3600_000) },
    });
    await tick(t);
    const after = await t.deps.prisma.guardianLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(after.status).toBe('active');
    expect(after.activatedAt).not.toBeNull();
  });

  it('expired codes are explained as expired', async () => {
    const other = await registerUser(t, 'expirer');
    const g = await registerUser(t, 'late');
    const invite = await call(t, 'POST', '/v1/guardians/invites', { token: other.accessToken });
    await t.deps.prisma.invite.updateMany({ where: { inviterId: other.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await call(t, 'POST', '/v1/guardian/invites/preview', { token: g.accessToken, body: { code: invite.body.code } });
    expect(r.body.error.code).toBe('CODE_EXPIRED');
  });
});

describe('lost-phone recovery with guardian quorum and a cancel window', () => {
  let t: TestApp;
  let owner: TestUser;
  let g1: TestUser;
  let g2: TestUser;

  beforeAll(async () => {
    t = await startTestApp();
    owner = await registerUser(t, 'priya', { displayName: 'Priya' });
    g1 = await registerUser(t, 'arun');
    g2 = await registerUser(t, 'divya');
    await makeGuardian(t, owner, g1);
    await makeGuardian(t, owner, g2);
  });
  afterAll(async () => {
    await t.close();
  });

  async function approve(g: TestUser, recoveryId: string, decision: 'approve' | 'deny' = 'approve') {
    const opts = await call(t, 'POST', `/v1/guardian/recoveries/${recoveryId}/options`, { token: g.accessToken });
    return call(t, 'POST', `/v1/guardian/recoveries/${recoveryId}/decision`, {
      token: g.accessToken,
      body: { decision, response: g.authenticator.get(opts.body.options) },
    });
  }

  it('answers identically for existing and unknown accounts', async () => {
    const a = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'nobody_here', device: newPhone } });
    expect(a.status).toBe(200);
    expect(Object.keys(a.body).sort()).toEqual(['pollToken', 'recoveryId', 'status']);
    const status = await call(t, 'POST', `/v1/recovery/${a.body.recoveryId}/status`, { body: { pollToken: a.body.pollToken } });
    expect(status.body).toEqual({ status: 'pending_approvals', approvals: 0, completesAt: null });
  });

  it('needs 2 approvals with 2+ guardians, opens a cancel window, then the new phone registers and old sessions die', async () => {
    const start = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'priya', device: newPhone } });
    const { recoveryId, pollToken } = start.body;
    // Existing phones are warned immediately, and guardians are asked.
    expect(t.push.forUser(owner.id).some((m) => m.type === 'recovery_alert')).toBe(true);
    expect(t.push.forUser(g1.id).some((m) => m.type === 'recovery_request')).toBe(true);
    // The old phone cannot make sensitive changes meanwhile.
    const blocked = await call(t, 'POST', '/v1/stepup', { token: owner.accessToken, body: { action: 'add_device', params: {} } });
    expect(blocked.body.error.code).toBe('RECOVERY_PENDING');

    expect((await approve(g1, recoveryId)).status).toBe(200);
    let st = await call(t, 'POST', `/v1/recovery/${recoveryId}/status`, { body: { pollToken } });
    expect(st.body).toMatchObject({ status: 'pending_approvals', approvals: 1 });
    expect((await approve(g2, recoveryId)).status).toBe(200);
    st = await call(t, 'POST', `/v1/recovery/${recoveryId}/status`, { body: { pollToken } });
    expect(st.body.status).toBe('cancel_window');
    expect(new Date(st.body.completesAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

    const active = await call(t, 'GET', '/v1/recovery/active', { token: owner.accessToken });
    expect(active.body.recovery).toMatchObject({ id: recoveryId, status: 'cancel_window', approvals: 2, requiredApprovals: 2, newDevice: { name: 'Redmi Note' } });

    // Registration is refused until the window has passed.
    expect((await call(t, 'POST', `/v1/recovery/${recoveryId}/register/options`, { body: { pollToken } })).status).toBe(409);
    await t.deps.prisma.recovery.update({ where: { id: recoveryId }, data: { completesAt: new Date(Date.now() - 1000) } });
    await tick(t);

    const phone = new SoftAuthenticator(appOrigin());
    const opts = await call(t, 'POST', `/v1/recovery/${recoveryId}/register/options`, { body: { pollToken } });
    const done = await call(t, 'POST', `/v1/recovery/${recoveryId}/register/verify`, { body: { pollToken, response: phone.create(opts.body.options) } });
    expect(done.status).toBe(200);
    expect(done.body.user.handle).toBe('priya');

    // The old phone is signed out everywhere and its refresh token no longer works.
    expect((await call(t, 'GET', '/v1/me', { token: owner.accessToken })).status).toBe(401);
    const refresh = await call(t, 'POST', '/v1/auth/refresh', { body: { refreshToken: owner.refreshToken, deviceId: owner.deviceId } });
    expect(refresh.status).toBe(401);
    // The new phone works.
    expect((await call(t, 'GET', '/v1/me', { token: done.body.session.accessToken })).status).toBe(200);
  });

  it('the real owner can cancel during the window', async () => {
    const victim = await registerUser(t, 'sita');
    const h1 = await registerUser(t, 'h1x');
    await makeGuardian(t, victim, h1);
    const start = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'sita', device: newPhone } });
    await approve(h1, start.body.recoveryId);
    const cancel = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/cancel`, { token: victim.accessToken });
    expect(cancel.status).toBe(204);
    const st = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/status`, { body: { pollToken: start.body.pollToken } });
    expect(st.body.error.code).toBe('RECOVERY_NOT_COMPLETED');
  });

  it('a guardian can refuse a recovery', async () => {
    const u = await registerUser(t, 'meera');
    const h = await registerUser(t, 'h2x');
    await makeGuardian(t, u, h);
    const start = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'meera', device: newPhone } });
    expect((await approve(h, start.body.recoveryId, 'deny')).status).toBe(200);
    const st = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/status`, { body: { pollToken: start.body.pollToken } });
    expect(st.body.error.code).toBe('RECOVERY_NOT_COMPLETED');
  });

  it('accounts without guardians can recover with a one-time recovery code', async () => {
    const u = await registerUser(t, 'nila');
    await grantConsent(t, u);
    await ageDevice(t, u);
    const { verify } = await stepup(t, u, 'view_recovery_codes', {}, calmSignals());
    const code: string = verify.body.result.codes[0];
    const start = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'nila', device: newPhone } });
    const wrong = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/code`, { body: { pollToken: start.body.pollToken, code: 'AAAAA-AAAAA' } });
    expect(wrong.body.error.code).toBe('CODE_INVALID');
    const ok = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/code`, { body: { pollToken: start.body.pollToken, code: code.toLowerCase() } });
    expect(ok.status).toBe(204);
    const st = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/status`, { body: { pollToken: start.body.pollToken } });
    expect(st.body.status).toBe('cancel_window');
  });

  it('a wrong poll token reveals nothing', async () => {
    const start = await call(t, 'POST', '/v1/recovery/start', { ip: randomIp(), body: { handle: 'arun', device: newPhone } });
    const r = await call(t, 'POST', `/v1/recovery/${start.body.recoveryId}/status`, { body: { pollToken: 'x'.repeat(43) } });
    expect(r.status).toBe(404);
  });
});
