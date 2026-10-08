// Guardians: accept an invite, hold their own passkey, and co-sign decisions.
// A guardian never gets access to the account they protect.
import crypto from 'node:crypto';
import { Router } from 'express';
import { read, write, newId, findUser, guardiansOf } from '../db.js';
import { publish } from '../sse.js';
import { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication } from '../webauthn.js';
import { route, HttpError, currentGuardian, credentialOwner, putChallenge, takeChallenge, establish, cleanName } from '../http.js';
import { logEvent } from '../audit.js';
import { config } from '../config.js';
import { findRequest, isDecidable, applyDecision, decisionChallenge, pendingFor } from '../requests.js';

const r = Router();

function liveInvite(code) {
  const inv = read().invites.find((i) => i.code === code);
  const fresh = inv && !inv.usedBy && Date.now() - inv.createdAt < config.inviteTtlHours * 3600 * 1000;
  return fresh ? inv : null;
}

function guardianProfile(g) {
  return {
    guardian: { name: g.name, guarding: g.guards.map((id) => findUser(id)?.name).filter(Boolean) },
    requests: pendingFor(g),
  };
}

function linkInvite(g, inv) {
  write(() => {
    if (!g.guards.includes(inv.userId)) g.guards.push(inv.userId);
    inv.usedBy = g.id;
  });
  const user = findUser(inv.userId);
  logEvent('guardian.linked', { userId: inv.userId, actor: g.name, summary: `${g.name} is now a guardian for ${user?.name}` });
  publish(`user:${inv.userId}`, 'guardians', guardiansOf(inv.userId).map((x) => x.name));
}

r.get('/invites/:code', route(async (req) => {
  const inv = liveInvite(req.params.code);
  if (!inv) throw new HttpError(404, 'invite_invalid');
  return { userName: findUser(inv.userId)?.name };
}));

r.post('/register/options', route(async (req) => {
  const name = cleanName(req.body.name);
  if (name.length < 2) throw new HttpError(400, 'name_required');
  const inv = liveInvite(req.body.invite);
  if (!inv) throw new HttpError(404, 'invite_invalid');
  const pending = { id: newId('g_'), name, userHandle: crypto.randomBytes(16).toString('base64url') };
  const options = await registrationOptions(req, { userHandle: pending.userHandle, name, displayName: `${name} (guardian)` });
  putChallenge(req, 'guardianRegister', { challenge: options.challenge, pending, invite: inv.code });
  return options;
}));

r.post('/register/verify', route(async (req) => {
  const { challenge, pending, invite } = takeChallenge(req, 'guardianRegister');
  const inv = liveInvite(invite);
  if (!inv) throw new HttpError(404, 'invite_invalid');
  const cred = await verifyRegistration(req, req.body, challenge);
  if (credentialOwner(cred.id)) throw new HttpError(409, 'already_registered');
  const g = { ...pending, createdAt: Date.now(), credentials: [cred], guards: [] };
  write((db) => db.guardians.push(g));
  linkInvite(g, inv);
  await establish(req, { guardianId: g.id });
  return guardianProfile(g);
}));

// An already-registered guardian can accept another invite.
r.post('/accept', route(async (req) => {
  const g = currentGuardian(req);
  const inv = liveInvite(req.body.invite);
  if (!inv) throw new HttpError(404, 'invite_invalid');
  linkInvite(g, inv);
  return guardianProfile(g);
}));

r.post('/login/options', route(async (req) => {
  const options = await authenticationOptions(req);
  putChallenge(req, 'guardianLogin', options.challenge);
  return options;
}));

r.post('/login/verify', route(async (req) => {
  const challenge = takeChallenge(req, 'guardianLogin');
  const found = credentialOwner(req.body?.id);
  if (!found) throw new HttpError(401, 'passkey_unknown');
  if (found.kind !== 'guardian') throw new HttpError(401, 'wrong_role_user');
  await verifyAuthentication(req, req.body, challenge, found.cred);
  write(() => {});
  await establish(req, { guardianId: found.owner.id });
  logEvent('guardian.login', { actor: found.owner.name, summary: `Guardian ${found.owner.name} signed in` });
  return guardianProfile(found.owner);
}));

r.post('/logout', route(async (req) => {
  delete req.session.guardianId;
  return { ok: true };
}));

r.get('/me', route(async (req) => guardianProfile(currentGuardian(req))));

// ---------- co-signing ----------

const DECISIONS = new Set(['approve', 'deny']);

r.post('/decisions/:id/options', route(async (req) => {
  const g = currentGuardian(req);
  const decision = req.body.decision;
  if (!DECISIONS.has(decision)) throw new HttpError(400, 'bad_decision');
  const request = findRequest(req.params.id);
  if (!isDecidable(request, g)) throw new HttpError(409, 'not_decidable');
  // Challenge = sha256(requestId|action|userId|expiry|nonce|decision): the
  // signature is useless for any other request or any other decision.
  return authenticationOptions(req, {
    allow: g.credentials,
    challenge: decisionChallenge(request, decision),
    userVerification: 'required',
  });
}));

r.post('/decisions/:id/verify', route(async (req) => {
  const g = currentGuardian(req);
  const { decision, response } = req.body;
  if (!DECISIONS.has(decision)) throw new HttpError(400, 'bad_decision');
  const request = findRequest(req.params.id);
  if (!isDecidable(request, g)) throw new HttpError(409, 'not_decidable');
  const cred = g.credentials.find((c) => c.id === response?.id);
  if (!cred) throw new HttpError(401, 'passkey_unknown');
  const expected = Buffer.from(decisionChallenge(request, decision)).toString('base64url');
  await verifyAuthentication(req, response, expected, cred, { requireUserVerification: true });
  // The nonce is single-use: rotate it so this exact signature can't be replayed.
  write(() => { request.nonce = crypto.randomBytes(16).toString('base64url'); });
  const updated = applyDecision(request, g, decision);
  return { request: updated && { id: updated.id, status: updated.status }, ...guardianProfile(g) };
}));

export default r;
