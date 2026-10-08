// "I lost my phone": guardians approve, the owner's other sessions get a
// cancel window, then the new phone registers a fresh passkey.
// Responses are identical whether or not the account name exists.
import { Router } from 'express';
import { write, findUser, findUserByName } from '../db.js';
import { registrationOptions, verifyRegistration } from '../webauthn.js';
import { route, HttpError, currentUser, credentialOwner, putChallenge, takeChallenge, establish, cleanName } from '../http.js';
import { createRecovery, findRequest, view, canRegisterRecovered, completeRecovery, cancelRecovery } from '../requests.js';

const r = Router();

// What the person on the new phone may see. Unknown names look exactly like
// real accounts whose guardians haven't answered yet.
function requesterView(rec) {
  const v = view(rec);
  return { id: v.id, status: v.status, readyAt: v.readyAt, approvals: v.approvals || undefined, required: v.required };
}

r.post('/start', route(async (req) => {
  const name = cleanName(req.body.name);
  if (name.length < 2) throw new HttpError(400, 'name_required');
  const rec = createRecovery(name, findUserByName(name));
  req.session.recoveryId = rec.id;
  return requesterView(rec);
}));

r.get('/status', route(async (req) => {
  const rec = req.session.recoveryId && findRequest(req.session.recoveryId);
  if (!rec) throw new HttpError(404, 'no_recovery');
  return requesterView(rec);
}));

r.post('/register/options', route(async (req) => {
  const rec = req.session.recoveryId && findRequest(req.session.recoveryId);
  if (!canRegisterRecovered(rec)) throw new HttpError(409, 'recovery_not_ready');
  const user = findUser(rec.userId);
  const options = await registrationOptions(req, { userHandle: user.userHandle, name: user.name, existing: user.credentials });
  putChallenge(req, 'recoveryRegister', { challenge: options.challenge, recoveryId: rec.id });
  return options;
}));

r.post('/register/verify', route(async (req) => {
  const { challenge, recoveryId } = takeChallenge(req, 'recoveryRegister');
  const rec = findRequest(recoveryId);
  if (!canRegisterRecovered(rec)) throw new HttpError(409, 'recovery_not_ready');
  const user = findUser(rec.userId);
  const cred = await verifyRegistration(req, req.body, challenge);
  if (credentialOwner(cred.id)) throw new HttpError(409, 'already_registered');
  write(() => user.credentials.push(cred));
  completeRecovery(rec);
  delete req.session.recoveryId;
  await establish(req, { userId: user.id, credCreatedAt: cred.createdAt });
  return { ok: true };
}));

// The real owner, signed in elsewhere, can stop a recovery at any point before it completes.
r.post('/:id/cancel', route(async (req) => {
  const user = currentUser(req);
  const rec = findRequest(req.params.id);
  if (!rec || rec.type !== 'recovery' || rec.userId !== user.id) throw new HttpError(404, 'not_found');
  return { request: view(cancelRecovery(rec, user)) };
}));

export default r;
