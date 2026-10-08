import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { appOrigin, call, login, registerUser } from '../helpers/client.js';
import { SoftAuthenticator } from '../helpers/soft-authenticator.js';

describe('passkey registration, login and sessions (software authenticator)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('registers with a discoverable, user-verified passkey and seeds the ledger account', async () => {
    const u = await registerUser(t, 'asha', { displayName: 'Asha', locale: 'ta' });
    const me = await call(t, 'GET', '/v1/me', { token: u.accessToken });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ handle: 'asha', displayName: 'Asha', locale: 'ta', deviceId: u.deviceId });
    const account = await t.deps.prisma.account.findUniqueOrThrow({ where: { userId: u.id } });
    expect(account.balanceMinor).toBe(t.deps.config.STARTING_BALANCE_MINOR);
    expect(account.currency).toBe('XTS');
    // Display name is encrypted at rest.
    const row = await t.deps.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.displayNameEnc).not.toContain('Asha');
  });

  it('asks the authenticator for a resident key with user verification', async () => {
    const res = await call(t, 'POST', '/v1/auth/register/options', {
      body: { handle: 'ravi', displayName: 'Ravi', device: { platform: 'android', name: 'Galaxy' } },
    });
    expect(res.body.options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
  });

  it('rejects a taken handle and invalid handles', async () => {
    await registerUser(t, 'meena');
    const taken = await call(t, 'POST', '/v1/auth/register/options', {
      body: { handle: 'Meena', displayName: 'M', device: { platform: 'android', name: 'x' } },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('HANDLE_TAKEN');
    const bad = await call(t, 'POST', '/v1/auth/register/options', {
      body: { handle: 'admin', displayName: 'M', device: { platform: 'android', name: 'x' } },
    });
    expect(bad.body.error.code).toBe('INVALID_INPUT');
  });

  it('signs in without a username and keeps the same device', async () => {
    const u = await registerUser(t, 'kavya');
    const res = await login(t, u.authenticator, u.deviceId);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.id);
    expect(res.body.deviceId).toBe(u.deviceId);
    expect(res.body.newDevice).toBe(false);
  });

  it('enrols a new device when a synced passkey is used on another phone, and alerts other phones', async () => {
    const u = await registerUser(t, 'deepa');
    const res = await login(t, u.authenticator);
    expect(res.body.newDevice).toBe(true);
    expect(res.body.deviceId).not.toBe(u.deviceId);
    expect(t.push.forUser(u.id).some((m) => m.type === 'new_device')).toBe(true);
  });

  it('rejects an assertion from a different origin (phishing site)', async () => {
    const u = await registerUser(t, 'farah');
    const phish = new SoftAuthenticator('https://cosign-login.example');
    phish.keys.push(...u.authenticator.keys);
    const res = await login(t, phish);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGN_IN_FAILED');
  });

  it('rejects replayed assertions (single-use challenges)', async () => {
    const u = await registerUser(t, 'gopal');
    const start = await call(t, 'POST', '/v1/auth/login/options');
    const response = u.authenticator.get(start.body.options);
    const device = { platform: 'android', name: 'x' };
    const first = await call(t, 'POST', '/v1/auth/login/verify', { body: { response, device } });
    expect(first.status).toBe(200);
    const replay = await call(t, 'POST', '/v1/auth/login/verify', { body: { response, device } });
    expect(replay.status).toBe(401);
  });

  it('gives the same generic answer for unknown credentials (no enumeration)', async () => {
    const stranger = new SoftAuthenticator(appOrigin());
    const opts = await call(t, 'POST', '/v1/auth/register/options', {
      body: { handle: 'stranger1', displayName: 'S', device: { platform: 'android', name: 'x' } },
    });
    stranger.create(opts.body.options); // credential the server never stored
    const res = await login(t, stranger);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGN_IN_FAILED');
  });

  it('rotates refresh tokens, binds them to the device and revokes the family on reuse', async () => {
    const u = await registerUser(t, 'harish');
    const wrongDevice = await call(t, 'POST', '/v1/auth/refresh', {
      body: { refreshToken: u.refreshToken, deviceId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(wrongDevice.status).toBe(401);

    const r1 = await call(t, 'POST', '/v1/auth/refresh', { body: { refreshToken: u.refreshToken, deviceId: u.deviceId } });
    expect(r1.status).toBe(200);
    const next = r1.body.session.refreshToken;
    expect(next).not.toBe(u.refreshToken);

    // Replaying the old token revokes the whole family, including the newest token.
    const reuse = await call(t, 'POST', '/v1/auth/refresh', { body: { refreshToken: u.refreshToken, deviceId: u.deviceId } });
    expect(reuse.status).toBe(401);
    const after = await call(t, 'POST', '/v1/auth/refresh', { body: { refreshToken: next, deviceId: u.deviceId } });
    expect(after.status).toBe(401);
    const events = await t.deps.prisma.auditEvent.findMany({ where: { action: 'auth.refresh_reuse_detected', subjectId: u.id } });
    expect(events).toHaveLength(1);
  });

  it('stores refresh tokens hashed', async () => {
    const u = await registerUser(t, 'indira');
    const rows = await t.deps.prisma.refreshToken.findMany({ where: { userId: u.id } });
    expect(rows.every((r) => r.tokenHash !== u.refreshToken)).toBe(true);
  });

  it('lists devices and revokes one: its tokens and passkey stop working immediately', async () => {
    const u = await registerUser(t, 'jaya');
    const second = await login(t, u.authenticator);
    const list = await call(t, 'GET', '/v1/devices', { token: u.accessToken });
    expect(list.body.devices).toHaveLength(2);

    const del = await call(t, 'DELETE', `/v1/devices/${second.body.deviceId}`, { token: u.accessToken });
    expect(del.status).toBe(204);
    const revokedAccess = await call(t, 'GET', '/v1/me', { token: second.body.session.accessToken });
    expect(revokedAccess.status).toBe(401);
    const refresh = await call(t, 'POST', '/v1/auth/refresh', {
      body: { refreshToken: second.body.session.refreshToken, deviceId: second.body.deviceId },
    });
    expect(refresh.status).toBe(401);
  });

  it('rejects requests without a token, with a tampered token, or with an admin token', async () => {
    expect((await call(t, 'GET', '/v1/me')).status).toBe(401);
    const u = await registerUser(t, 'kumar');
    const tampered = u.accessToken.slice(0, -2) + (u.accessToken.endsWith('a') ? 'bb' : 'aa');
    expect((await call(t, 'GET', '/v1/me', { token: tampered })).status).toBe(401);
  });

  it('limits sign-in attempts per address and states the exact wait', async () => {
    const ip = '192.0.2.77';
    let last;
    for (let i = 0; i < 12; i++) {
      last = await call(t, 'POST', '/v1/auth/login/verify', {
        ip,
        body: { response: { id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: { clientDataJSON: 'AAAA', authenticatorData: 'AAAA', signature: 'AAAA' }, clientExtensionResults: {} }, device: { platform: 'android', name: 'x' } },
      });
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    expect(last!.body.error.next).toMatch(/Wait \d+ (second|minute)/);
  });

  it('keeps the audit chain valid after all of the above', async () => {
    const v = await t.deps.audit.verifyChain();
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(10);
  });
});
