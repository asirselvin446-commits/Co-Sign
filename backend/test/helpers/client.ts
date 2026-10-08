import type { InjectOptions } from 'fastify';
import { androidOrigin } from '../../src/modules/webauthn/webauthn.service.js';
import type { TestApp } from './app.js';
import { SoftAuthenticator } from './soft-authenticator.js';

export const TEST_FINGERPRINT = process.env.ANDROID_SHA256_CERT_FINGERPRINTS!.split(',')[0]!;
export const appOrigin = () => androidOrigin(TEST_FINGERPRINT);

export interface TestUser {
  id: string;
  handle: string;
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  authenticator: SoftAuthenticator;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are asserted field by field
export async function call<T = any>(
  t: TestApp,
  method: InjectOptions['method'],
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {},
): Promise<{ status: number; body: T; headers: Record<string, unknown> }> {
  const res = await t.app.inject({
    method,
    url,
    remoteAddress: opts.ip ?? '127.0.0.1',
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    ...(opts.body !== undefined ? { payload: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.statusCode, body: res.body ? (res.json() as T) : (undefined as T), headers: res.headers };
}

/** A fresh simulated phone address, so per-IP limits do not couple unrelated test users. */
export const randomIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${1 + ((Math.random() * 250) | 0)}`;

export async function registerUser(
  t: TestApp,
  handle: string,
  opts: { displayName?: string; locale?: 'en' | 'ta' | 'hi'; authenticator?: SoftAuthenticator } = {},
): Promise<TestUser> {
  const authenticator = opts.authenticator ?? new SoftAuthenticator(appOrigin());
  const ip = randomIp();
  const start = await call(t, 'POST', '/v1/auth/register/options', {
    ip,
    body: { handle, displayName: opts.displayName ?? `User ${handle}`, locale: opts.locale ?? 'en', device: { platform: 'android', name: 'Pixel 8' } },
  });
  if (start.status !== 200) throw new Error(`register options failed: ${JSON.stringify(start.body)}`);
  const response = authenticator.create(start.body.options);
  const done = await call(t, 'POST', '/v1/auth/register/verify', { ip, body: { response } });
  if (done.status !== 200) throw new Error(`register verify failed: ${JSON.stringify(done.body)}`);
  return {
    id: done.body.user.id,
    handle,
    deviceId: done.body.deviceId,
    accessToken: done.body.session.accessToken,
    refreshToken: done.body.session.refreshToken,
    authenticator,
  };
}

export async function login(t: TestApp, authenticator: SoftAuthenticator, deviceId?: string, ip = randomIp()) {
  const start = await call(t, 'POST', '/v1/auth/login/options', { ip });
  const response = authenticator.get(start.body.options);
  return call(t, 'POST', '/v1/auth/login/verify', {
    ip,
    body: { response, ...(deviceId ? { deviceId } : {}), device: { platform: 'android', name: 'Pixel 8' } },
  });
}
