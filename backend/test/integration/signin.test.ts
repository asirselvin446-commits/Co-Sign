import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MONITOR_CONSENT_VERSION } from '../../src/modules/monitor/monitor.routes.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, registerUser, type TestUser } from '../helpers/client.js';
import { makeGuardian, tick } from '../helpers/flows.js';
import { newRecipient, open, seal, signinAad } from '../helpers/seal.js';

const yono = { package: 'com.sbi.lotusintouch', webDomain: null, appLabel: 'YONO SBI' };
const unknownCall = { active: true, durationSec: 400, caller: 'unknown', repeatCount: 0 };

describe('guardian-assisted sign-in (end-to-end sealed)', () => {
  let t: TestApp;
  let nani: TestUser;
  let ravi: TestUser;
  let stranger: TestUser;
  let token: string;

  beforeAll(async () => {
    t = await startTestApp();
    nani = await registerUser(t, 'nani', { displayName: 'Nani' });
    ravi = await registerUser(t, 'ravig', { displayName: 'Ravi' });
    stranger = await registerUser(t, 'strangerx');
    await makeGuardian(t, nani, ravi);
    await call(t, 'PUT', '/v1/monitor/consent', { token: nani.accessToken, body: { granted: true, version: MONITOR_CONSENT_VERSION } });
    token = (await call(t, 'POST', '/v1/monitor/token', { token: nani.accessToken })).body.token;
  });
  afterAll(async () => {
    await t.close();
  });

  const ask = (body: Record<string, unknown>) => call(t, 'POST', '/v1/signin', { headers: { 'x-monitor-token': token }, body });
  const poll = (id: string) => call(t, 'GET', `/v1/signin/${id}`, { headers: { 'x-monitor-token': token } });

  /** The guardian's phone: seal the password to the asking phone and answer (signed in; no passkey). */
  const fill = (guardian: TestUser, id: string, sealed: string) =>
    call(t, 'POST', `/v1/guardian/signin/${id}/answer`, { token: guardian.accessToken, body: { decision: 'fill', ciphertext: sealed } });
  const deny = (guardian: TestUser, id: string) => call(t, 'POST', `/v1/guardian/signin/${id}/answer`, { token: guardian.accessToken, body: { decision: 'deny' } });

  it('asks the guardian with one-tap buttons, fills once, and the server never sees the password', async () => {
    const phone = newRecipient();
    const created = await ask({ target: yono, publicKey: phone.publicKeySpkiB64, call: null });
    expect(created.status).toBe(200);
    const id = created.body.id as string;

    const push = t.push.forUser(ravi.id).find((m) => m.type === 'signin_request' && m.data.signinId === id)!;
    expect(push.title).toBe('Nani wants to sign in to YONO SBI');
    expect(JSON.parse(push.data.actions!).map((a: { id: string }) => a.id)).toEqual(['fill', 'deny']);

    const view = await call(t, 'GET', `/v1/guardian/signin/${id}`, { token: ravi.accessToken });
    expect(view.body).toMatchObject({ status: 'pending', mode: 'fill', person: { displayName: 'Nani' }, target: { package: 'com.sbi.lotusintouch', verdict: 'app' }, publicKey: phone.publicKeySpkiB64 });
    expect((await call(t, 'GET', `/v1/guardian/signin/${id}`, { token: stranger.accessToken })).status).toBe(404);

    const secret = JSON.stringify({ u: 'nani1950', p: 'S3cret-Pin#42' });
    const sealed = seal(phone.publicKeySpkiB64, secret, signinAad(id, yono.package, null));
    expect((await fill(ravi, id, sealed)).body.status).toBe('filled');

    // The asking phone collects it exactly once and only it can open it.
    const first = await poll(id);
    expect(first.body).toMatchObject({ status: 'delivered', guardianName: 'Ravi' });
    expect(open(phone.privateKey, first.body.ciphertext, signinAad(id, yono.package, null))).toBe(secret);
    expect(() => open(phone.privateKey, first.body.ciphertext, signinAad(id, 'com.fake.yono', null))).toThrow();
    const second = await poll(id);
    expect(second.body.ciphertext).toBeNull();

    // Nothing readable is kept anywhere on the server.
    const row = await t.deps.prisma.signinRequest.findUniqueOrThrow({ where: { id } });
    expect(row.ciphertext).toBeNull();
    const everything = JSON.stringify([await t.deps.prisma.signinRequest.findMany(), await t.deps.prisma.auditEvent.findMany()], (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(everything).not.toContain('S3cret');
    expect(everything).not.toContain('nani1950');

    const mine = await call(t, 'GET', '/v1/signin', { token: nani.accessToken });
    expect(mine.body.requests[0]).toMatchObject({ id, status: 'delivered', guardianName: 'Ravi', target: { appLabel: 'YONO SBI' } });
  });

  it('only a guardian of this person can answer, once, and "fill" must carry the sealed answer', async () => {
    const phone = newRecipient();
    const id = (await ask({ target: yono, publicKey: phone.publicKeySpkiB64, call: null })).body.id as string;
    const sealed = seal(phone.publicKeySpkiB64, '{"u":"a","p":"b"}', signinAad(id, yono.package, null));
    expect((await fill(stranger, id, sealed)).status).toBe(404);
    const empty = await call(t, 'POST', `/v1/guardian/signin/${id}/answer`, { token: ravi.accessToken, body: { decision: 'fill' } });
    expect(empty.status).toBe(400);
    expect((await fill(ravi, id, sealed)).body.status).toBe('filled');
    const again = await deny(ravi, id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REQUEST_ALREADY_DECIDED');
  });

  it('never asks a guardian to sign in to a fake website, and alerts them instead', async () => {
    const phone = newRecipient();
    const r = await ask({ target: { package: 'com.android.chrome', webDomain: 'sbi-kyc-update.xyz', appLabel: 'Chrome' }, publicKey: phone.publicKeySpkiB64, call: null });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('SIGNIN_BLOCKED_FAKE_SITE');
    const alerts = await call(t, 'GET', '/v1/guardian/alerts', { token: ravi.accessToken });
    expect(alerts.body.alerts[0]).toMatchObject({ kind: 'phishing_page', severity: 'critical', link: { domain: 'sbi-kyc-update.xyz', verdict: 'lookalike' } });
  });

  it('websites are checked: an unknown site carries a warning for the guardian', async () => {
    const phone = newRecipient();
    const r = await ask({ target: { package: 'com.android.chrome', webDomain: 'shop.example.org', appLabel: 'Chrome' }, publicKey: phone.publicKeySpkiB64, call: unknownCall });
    const view = await call(t, 'GET', `/v1/guardian/signin/${r.body.id}`, { token: ravi.accessToken });
    expect(view.body.target).toMatchObject({ host: 'shop.example.org', domain: 'example.org', verdict: 'unknown' });
    expect(view.body.reasons.map((x: { key: string }) => x.key)).toEqual(['signin_risky_call', 'signin_recent_alert', 'signin_unknown_site']);
  });

  it('refuses to show a password while the person is on a call with an unknown number', async () => {
    const phone = newRecipient();
    const r = await ask({ mode: 'show', target: yono, publicKey: phone.publicKeySpkiB64, call: unknownCall });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SIGNIN_SHOW_REFUSED_ON_CALL');
  });

  it('a denial reaches the phone at once with who answered; an unanswered request expires', async () => {
    const phone = newRecipient();
    const id = (await ask({ target: yono, publicKey: phone.publicKeySpkiB64, call: null })).body.id as string;
    // Saying no needs nothing more than the guardian's signed-in phone.
    expect((await deny(ravi, id)).body.status).toBe('denied');
    expect((await poll(id)).body).toMatchObject({ status: 'denied', guardianName: 'Ravi', ciphertext: null });

    const late = (await ask({ target: yono, publicKey: phone.publicKeySpkiB64, call: null })).body.id as string;
    await t.deps.prisma.signinRequest.update({ where: { id: late }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await tick(t);
    expect((await poll(late)).body.status).toBe('expired');
    const tooLate = await deny(ravi, late);
    expect(tooLate.status).toBe(409);
  });

  it('someone without a guardian is told who to add', async () => {
    const solo = await registerUser(t, 'soloperson');
    await call(t, 'PUT', '/v1/monitor/consent', { token: solo.accessToken, body: { granted: true, version: MONITOR_CONSENT_VERSION } });
    const soloToken = (await call(t, 'POST', '/v1/monitor/token', { token: solo.accessToken })).body.token;
    const r = await call(t, 'POST', '/v1/signin', { headers: { 'x-monitor-token': soloToken }, body: { target: yono, publicKey: newRecipient().publicKeySpkiB64 } });
    expect(r.body.error.code).toBe('SIGNIN_NO_GUARDIAN');
  });

  it('opens the shared cross-language sample sealed for the phone', () => {
    const v = JSON.parse(readFileSync(join(import.meta.dirname, '../../../shared/signin-crypto-vector.json'), 'utf8')) as {
      recipientPkcs8: string;
      requestId: string;
      package: string | null;
      host: string | null;
      sealed: string;
      plaintext: string;
    };
    const key = createPrivateKey({ key: Buffer.from(v.recipientPkcs8, 'base64'), format: 'der', type: 'pkcs8' });
    expect(open(key, v.sealed, signinAad(v.requestId, v.package, v.host))).toBe(v.plaintext);
  });

  it('records every step in a valid audit chain', async () => {
    const actions = (await t.deps.prisma.auditEvent.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['signin.created', 'signin.answered', 'signin.delivered', 'signin.denied', 'signin.expired', 'signin.blocked_fake_site']) expect(actions).toContain(a);
    expect((await t.deps.audit.verifyChain()).ok).toBe(true);
  });
});
