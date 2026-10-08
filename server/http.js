// Small HTTP helpers shared by the route modules.
import { read, findUser, findGuardian } from './db.js';

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Wraps an async handler so thrown errors become JSON `{ error: code }`. */
export const route = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    const status = err.status || 400;
    const code = err.code && typeof err.code === 'string' && !err.code.startsWith('ERR_') ? err.code : 'verification_failed';
    if (status >= 500 || !err.status) console.warn(`[${req.method} ${req.path}]`, err.message);
    if (!res.headersSent) res.status(status).json({ error: code });
  }
};

export function currentUser(req) {
  const user = req.session.userId && findUser(req.session.userId);
  if (!user) throw new HttpError(401, 'not_signed_in');
  return user;
}

export function currentGuardian(req) {
  const g = req.session.guardianId && findGuardian(req.session.guardianId);
  if (!g) throw new HttpError(401, 'not_signed_in');
  return g;
}

/** Finds which account (user or guardian) owns a credential id. */
export function credentialOwner(credentialId) {
  const db = read();
  for (const user of db.users) {
    const cred = user.credentials.find((c) => c.id === credentialId);
    if (cred) return { kind: 'user', owner: user, cred };
  }
  for (const g of db.guardians) {
    const cred = g.credentials.find((c) => c.id === credentialId);
    if (cred) return { kind: 'guardian', owner: g, cred };
  }
  return null;
}

/** One-shot challenge storage in the session, keyed by purpose. */
export function putChallenge(req, purpose, value) {
  req.session.challenges = { ...(req.session.challenges || {}), [purpose]: value };
}

export function takeChallenge(req, purpose) {
  const value = req.session.challenges?.[purpose];
  if (!value) throw new HttpError(400, 'challenge_missing');
  delete req.session.challenges[purpose];
  return value;
}

/**
 * Rotates the session id on sign-in (prevents session fixation) while keeping
 * the other roles that share this browser, e.g. a guardian tab next to a user tab.
 */
export function establish(req, patch) {
  const keep = {
    userId: req.session.userId,
    credCreatedAt: req.session.credCreatedAt,
    guardianId: req.session.guardianId,
    recoveryId: req.session.recoveryId,
  };
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, keep, patch);
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

export const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
