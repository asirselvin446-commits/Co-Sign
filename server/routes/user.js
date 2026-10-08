// Account holder: register, passkey login, account home, invites, signals, payment OTP.
import crypto from 'node:crypto';
import { Router } from 'express';
import { read, write, newId, findUser, findUserByName, guardiansOf } from '../db.js';
import { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication } from '../webauthn.js';
import { route, HttpError, currentUser, credentialOwner, putChallenge, takeChallenge, establish, cleanName } from '../http.js';
import { logEvent } from '../audit.js';
import { assess, SIGNAL_KEYS } from '../risk.js';
import { view } from '../requests.js';
import { publish } from '../sse.js';
import { config } from '../config.js';
import { ruleByCode } from '../../public/js/catalog.js';

const SIGNAL_RULE = { unknownCall: 'unknown_call', remoteAccess: 'remote_access', screenShare: 'screen_share', simChanged: 'sim_changed' };

const r = Router();

const maskPhone = (p) => (p ? `•••• ••${String(p).slice(-4)}` : null);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('base64url');

function profile(req, user) {
  const db = read();
  return {
    user: {
      name: user.name,
      balance: user.balance,
      phone: maskPhone(user.phone),
      transferLimit: user.transferLimit,
      guardians: guardiansOf(user.id).map((g) => g.name),
      signalToken: user.signalToken,
      signals: user.signals,
    },
    risk: assess(user, req.session),
    stepups: db.stepups.filter((s) => s.userId === user.id && ['pending_guardian', 'approved', 'cooloff', 'ready'].includes(s.status)).map(view),
    recoveries: db.recoveries.filter((x) => x.userId === user.id && ['pending_guardian', 'cancel_window', 'ready'].includes(x.status)).map(view),
  };
}

// ---------- registration ----------

r.post('/register/options', route(async (req) => {
  const name = cleanName(req.body.name);
  if (name.length < 2) throw new HttpError(400, 'name_required');
  if (findUserByName(name)) throw new HttpError(409, 'name_taken');
  const pending = { id: newId('u_'), name, userHandle: crypto.randomBytes(16).toString('base64url') };
  const options = await registrationOptions(req, { userHandle: pending.userHandle, name });
  putChallenge(req, 'userRegister', { challenge: options.challenge, pending });
  return options;
}));

r.post('/register/verify', route(async (req) => {
  const { challenge, pending } = takeChallenge(req, 'userRegister');
  if (findUserByName(pending.name)) throw new HttpError(409, 'name_taken');
  const cred = await verifyRegistration(req, req.body, challenge);
  if (credentialOwner(cred.id)) throw new HttpError(409, 'already_registered');
  const user = {
    ...pending,
    createdAt: Date.now(),
    credentials: [cred],
    balance: 48250,
    phone: '9840012345',
    transferLimit: 25000,
    signals: Object.fromEntries(SIGNAL_KEYS.map((k) => [k, false])),
    signalToken: crypto.randomBytes(12).toString('base64url'),
  };
  write((db) => db.users.push(user));
  await establish(req, { userId: user.id, credCreatedAt: cred.createdAt });
  logEvent('user.registered', { userId: user.id, actor: user.name, summary: `${user.name} created an account with a passkey` });
  return profile(req, user);
}));

// ---------- login (discoverable: no username, so no account enumeration) ----------

r.post('/login/options', route(async (req) => {
  const options = await authenticationOptions(req);
  putChallenge(req, 'userLogin', options.challenge);
  return options;
}));

r.post('/login/verify', route(async (req) => {
  const challenge = takeChallenge(req, 'userLogin');
  const found = credentialOwner(req.body?.id);
  if (!found) {
    logEvent('login.failure', { summary: 'Sign-in with an unrecognised passkey' });
    throw new HttpError(401, 'passkey_unknown');
  }
  if (found.kind !== 'user') throw new HttpError(401, 'wrong_role_guardian');
  try {
    await verifyAuthentication(req, req.body, challenge, found.cred);
  } catch {
    logEvent('login.failure', { userId: found.owner.id, actor: found.owner.name, summary: `${found.owner.name}: passkey check failed` });
    throw new HttpError(401, 'verification_failed');
  }
  write(() => {}); // persist counter
  await establish(req, { userId: found.owner.id, credCreatedAt: found.cred.createdAt });
  logEvent('login.success', { userId: found.owner.id, actor: found.owner.name, summary: `${found.owner.name} signed in with a passkey` });
  return profile(req, found.owner);
}));

r.post('/logout', route(async (req) => {
  delete req.session.userId;
  delete req.session.credCreatedAt;
  return { ok: true };
}));

r.get('/me', route(async (req) => profile(req, currentUser(req))));

// ---------- guardian invites ----------

r.post('/invites', route(async (req) => {
  const user = currentUser(req);
  const code = crypto.randomBytes(9).toString('base64url');
  write((db) => db.invites.push({ code, userId: user.id, createdAt: Date.now(), usedBy: null }));
  logEvent('invite.created', { userId: user.id, actor: user.name, summary: `${user.name} created a guardian invite` });
  return { code, path: `/guardian.html?invite=${code}` };
}));

// ---------- risk signals (simulated panel today, Android companion later) ----------

function signalTarget(req) {
  const token = req.get('x-signal-token');
  if (token) {
    const user = read().users.find((u) => u.signalToken === token);
    if (!user) throw new HttpError(401, 'bad_token');
    return user;
  }
  return currentUser(req);
}

r.post('/signals', route(async (req) => {
  const user = signalTarget(req);
  const next = { ...user.signals };
  for (const k of SIGNAL_KEYS) if (typeof req.body[k] === 'boolean') next[k] = req.body[k];
  write(() => { user.signals = next; });
  const on = SIGNAL_KEYS.filter((k) => next[k]).map((k) => ruleByCode(SIGNAL_RULE[k]).text.en.toLowerCase());
  const source = req.get('x-signal-token') ? 'phone app' : 'demo simulator';
  logEvent('signals.updated', {
    userId: user.id,
    actor: source,
    summary: `${user.name} (${source}): ${on.length ? on.join('; ') : 'no scam signals'}`,
  });
  const risk = assess(user, req.get('x-signal-token') ? null : req.session);
  publish(`user:${user.id}`, 'risk', risk);
  return { signals: next, risk };
}));

r.get('/risk', route(async (req) => assess(currentUser(req), req.session)));

// Client-side failures (cancelled passkey prompt, etc.) count toward "recent failures".
const CLIENT_FAILURES = {
  webauthn_not_allowed: 'passkey prompt cancelled or timed out',
  webauthn_invalid_state: 'passkey already exists on this device',
  webauthn_security: 'passkey blocked: wrong address',
  webauthn_not_supported: 'device cannot use passkeys',
  otp_native_digits: 'OTP typed in Tamil/Devanagari digits (explained, one-tap fix offered)',
};
r.post('/failures', route(async (req) => {
  const code = String(req.body.code || '');
  if (!Object.hasOwn(CLIENT_FAILURES, code)) throw new HttpError(400, 'unknown_code');
  const user = req.session.userId ? findUser(req.session.userId) : null;
  logEvent('client.failure', { userId: user?.id, actor: user?.name, summary: `${user?.name || 'Visitor'}: ${CLIENT_FAILURES[code]}` });
  return { ok: true };
}));

// ---------- payment OTP (simulated SMS) ----------

r.post('/payment/start', route(async (req) => {
  const user = currentUser(req);
  const amount = Math.max(1, Math.min(100000, Math.round(Number(req.body.amount) || 500)));
  const payee = cleanName(req.body.payee) || 'Ravi Stores';
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = Date.now() + config.otpTtlSeconds * 1000;
  write(() => { user.pendingPayment = { otpHash: sha256(otp), expiresAt, amount, payee, attempts: 0 }; });
  logEvent('otp.sent', { userId: user.id, actor: user.name, summary: `OTP sent to ${user.name} for ₹${amount} to ${payee}` });
  // The SMS goes to the "phone" panel; in real life this is the carrier, not the API response.
  return {
    amount, payee, expiresAt,
    sms: { from: 'SAATHI', otp, text: `${otp} is your OTP to pay ₹${amount} to ${payee}. Never share it with anyone, not even police or bank staff.` },
  };
}));

r.post('/payment/confirm', route(async (req) => {
  const user = currentUser(req);
  const otp = String(req.body.otp || '').trim();
  if (req.body.pasted === true) write(() => { user.otpPastedAt = Date.now(); });
  const p = user.pendingPayment;
  const fail = (code, status = 400) => {
    logEvent('otp.failure', { userId: user.id, actor: user.name, summary: `${user.name}: payment code ${code.replace('otp_', '').replaceAll('_', ' ')}` });
    return new HttpError(status, code);
  };
  if (/[௦-௯०-९]/.test(otp)) throw fail('otp_native_digits');
  if (!p) throw fail('otp_expired');
  if (Date.now() > p.expiresAt) {
    write(() => { delete user.pendingPayment; });
    throw fail('otp_expired');
  }
  if (!/^\d{6}$/.test(otp) || sha256(otp) !== p.otpHash) {
    const attempts = p.attempts + 1;
    write(() => { if (attempts >= 5) delete user.pendingPayment; else p.attempts = attempts; });
    throw fail(attempts >= 5 ? 'otp_too_many' : 'otp_wrong');
  }
  write(() => {
    user.balance -= p.amount;
    delete user.pendingPayment;
  });
  logEvent('otp.success', { userId: user.id, actor: user.name, summary: `${user.name} paid ₹${p.amount} to ${p.payee}` });
  return { ok: true, amount: p.amount, payee: p.payee, balance: user.balance };
}));

export default r;
