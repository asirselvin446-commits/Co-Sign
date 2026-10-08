import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminInvite } from '../../src/modules/admin/admin-auth.routes.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call } from '../helpers/client.js';
import { SoftAuthenticator } from '../helpers/soft-authenticator.js';

const WEB = 'http://localhost:5173';
const csrf = { 'x-requested-with': 'cosign-dashboard' };

describe('well-known files', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('serves assetlinks.json from env', async () => {
    const res = await call(t, 'GET', '/.well-known/assetlinks.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body[0].target).toEqual({
      namespace: 'android_app',
      package_name: 'app.cosign.mobile',
      sha256_cert_fingerprints: [process.env.ANDROID_SHA256_CERT_FINGERPRINTS],
    });
    expect(res.body[0].relation).toContain('delegate_permission/common.get_login_creds');
  });

  it('serves apple-app-site-association from env', async () => {
    const res = await call(t, 'GET', '/.well-known/apple-app-site-association');
    expect(res.body.webcredentials.apps).toEqual(['ABCDE12345.app.cosign.mobile']);
  });
});

describe('dashboard staff passkeys', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  async function registerAdmin(role: 'admin' | 'analyst', handle: string) {
    const { url } = await createAdminInvite({ deps: t.deps }, role, null);
    const inviteToken = new URL(url).searchParams.get('invite')!;
    const auth = new SoftAuthenticator(WEB);
    const start = await call(t, 'POST', '/v1/admin/auth/register/options', {
      body: { inviteToken, handle, displayName: handle },
      headers: csrf,
    });
    expect(start.status).toBe(200);
    const done = await call(t, 'POST', '/v1/admin/auth/register/verify', { body: { response: auth.create(start.body.options) }, headers: csrf });
    expect(done.status).toBe(200);
    return { auth, inviteToken, accessToken: done.body.accessToken as string, cookie: String(done.headers['set-cookie']) };
  }

  it('registers from a one-time invite and refuses to reuse it', async () => {
    const a = await registerAdmin('admin', 'sec.lead');
    expect(a.cookie).toContain('HttpOnly');
    expect(a.cookie).toContain('SameSite=Strict');
    const again = await call(t, 'POST', '/v1/admin/auth/register/options', {
      body: { inviteToken: a.inviteToken, handle: 'other', displayName: 'o' },
      headers: csrf,
    });
    expect(again.body.error.code).toBe('INVITE_INVALID');
  });

  it('requires the anti-CSRF header', async () => {
    const res = await call(t, 'POST', '/v1/admin/auth/login/options');
    expect(res.status).toBe(403);
  });

  it('logs in with a passkey and rotates the refresh cookie', async () => {
    const a = await registerAdmin('admin', 'sec.two');
    const start = await call(t, 'POST', '/v1/admin/auth/login/options', { headers: csrf });
    const done = await call(t, 'POST', '/v1/admin/auth/login/verify', { body: { response: a.auth.get(start.body.options) }, headers: csrf });
    expect(done.status).toBe(200);
    expect(done.body.admin.role).toBe('admin');
    const cookie = String(done.headers['set-cookie']).split(';')[0]!;
    const refreshed = await t.app.inject({ method: 'POST', url: '/v1/admin/auth/refresh', headers: { cookie, ...csrf } });
    expect(refreshed.statusCode).toBe(200);
    // The old cookie value was used once; replaying it is reuse and fails.
    const replay = await t.app.inject({ method: 'POST', url: '/v1/admin/auth/refresh', headers: { cookie, ...csrf } });
    expect(replay.statusCode).toBe(401);
  });

  it('rejects a staff passkey used from an app origin', async () => {
    const a = await registerAdmin('analyst', 'analyst.one');
    const wrong = new SoftAuthenticator('android:apk-key-hash:abc');
    wrong.keys.push(...a.auth.keys);
    const start = await call(t, 'POST', '/v1/admin/auth/login/options', { headers: csrf });
    const res = await call(t, 'POST', '/v1/admin/auth/login/verify', { body: { response: wrong.get(start.body.options) }, headers: csrf });
    expect(res.status).toBe(401);
  });

  it('enforces roles: analysts cannot manage staff', async () => {
    const analyst = await registerAdmin('analyst', 'analyst.two');
    const res = await call(t, 'GET', '/v1/admin/staff', { token: analyst.accessToken });
    expect(res.status).toBe(403);
    const admin = await registerAdmin('admin', 'sec.three');
    const ok = await call(t, 'GET', '/v1/admin/staff', { token: admin.accessToken });
    expect(ok.status).toBe(200);
  });

  it('does not accept staff tokens on user endpoints', async () => {
    const admin = await registerAdmin('admin', 'sec.four');
    expect((await call(t, 'GET', '/v1/me', { token: admin.accessToken })).status).toBe(401);
  });
});
