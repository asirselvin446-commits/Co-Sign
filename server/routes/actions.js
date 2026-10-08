// Sensitive actions. Low risk: the user's own passkey re-check. High risk:
// paused until a guardian co-signs, or until a cool-off delay passes.
import crypto from 'node:crypto';
import { Router } from 'express';
import { write } from '../db.js';
import { authenticationOptions, verifyAuthentication } from '../webauthn.js';
import { route, HttpError, currentUser, putChallenge, takeChallenge } from '../http.js';
import { assess } from '../risk.js';
import { logEvent } from '../audit.js';
import { createStepup, findRequest, canFinish, completeStepup, cancelStepup, view } from '../requests.js';
import { ACTIONS } from '../../public/js/catalog.js';

const r = Router();

const SENSITIVE = {
  add_device: {
    parse: () => ({}),
    perform: () => {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      return { pairingCode: `${code.slice(0, 4)}-${code.slice(4)}` };
    },
  },
  show_otp: {
    parse: () => ({}),
    perform: () => ({ otp: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') }),
  },
  change_phone: {
    parse: (body) => {
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(phone)) throw new HttpError(400, 'phone_invalid');
      return { params: { phone }, masked: { phone: `•••• ••${phone.slice(-4)}` } };
    },
    perform: (user, params) => {
      user.phone = params.phone;
      return { phone: `•••• ••${params.phone.slice(-4)}` };
    },
  },
  raise_limit: {
    parse: (body) => {
      const limit = Math.round(Number(body.limit) || 200000);
      if (limit < 1000 || limit > 1000000) throw new HttpError(400, 'limit_invalid');
      return { params: { limit }, masked: { limit } };
    },
    perform: (user, params) => {
      user.transferLimit = params.limit;
      return { transferLimit: params.limit };
    },
  },
};

r.post('/actions', route(async (req) => {
  const user = currentUser(req);
  const action = String(req.body.action || '');
  const spec = SENSITIVE[action];
  if (!spec) throw new HttpError(400, 'unknown_action');
  const { params = {}, masked = null } = spec.parse(req.body) || {};
  const risk = assess(user, req.session);
  const stepup = createStepup({ user, action, params, paramsMasked: masked, risk });
  return { request: view(stepup), risk };
}));

r.post('/actions/:id/finish/options', route(async (req) => {
  const user = currentUser(req);
  const s = findRequest(req.params.id);
  if (!s || s.userId !== user.id) throw new HttpError(404, 'not_found');
  if (!canFinish(s)) throw new HttpError(409, `not_ready_${s.status}`);
  const options = await authenticationOptions(req, { allow: user.credentials });
  putChallenge(req, `finish:${s.id}`, options.challenge);
  return options;
}));

r.post('/actions/:id/finish/verify', route(async (req) => {
  const user = currentUser(req);
  const s = findRequest(req.params.id);
  if (!s || s.userId !== user.id) throw new HttpError(404, 'not_found');
  const challenge = takeChallenge(req, `finish:${s.id}`);
  if (!canFinish(s)) throw new HttpError(409, `not_ready_${s.status}`);
  const cred = user.credentials.find((c) => c.id === req.body?.id);
  if (!cred) throw new HttpError(401, 'passkey_unknown');
  await verifyAuthentication(req, req.body, challenge, cred);
  let result;
  write(() => { result = SENSITIVE[s.action].perform(user, s.params); });
  const done = completeStepup(s);
  logEvent('action.completed', {
    userId: user.id,
    actor: user.name,
    summary: `${user.name} completed "${ACTIONS[s.action].text.en}"${s.decidedByName ? ` (approved by ${s.decidedByName})` : ''}`,
  });
  return { request: view(done), result };
}));

r.post('/actions/:id/cancel', route(async (req) => {
  const user = currentUser(req);
  const s = findRequest(req.params.id);
  if (!s || s.userId !== user.id || s.type !== 'stepup') throw new HttpError(404, 'not_found');
  return { request: view(cancelStepup(s, user)) };
}));

export default r;
