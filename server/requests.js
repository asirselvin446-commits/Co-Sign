// Step-ups (sensitive actions) and recoveries share one guardian-decision
// mechanism. This module owns their state machines and the timer that moves
// them forward; routes only call into it.
//
// Step-up:   self ─────────────────────────────┐
//            pending_guardian ─approve─> approved ├─finish─> completed
//                 │  └─deny─> denied              │
//                 └─timeout─> cooloff ─time─> ready┘     (any open state ─cancel─> cancelled)
//
// Recovery:  pending_guardian ─enough approvals─> cancel_window ─time─> ready ─new passkey─> completed
//                 └─deny─> denied               └─owner cancels─> cancelled
import crypto from 'node:crypto';
import { read, write, newId, findUser, guardiansOf } from './db.js';
import { publish } from './sse.js';
import { logEvent } from './audit.js';
import { config } from './config.js';
import { ACTIONS } from '../public/js/catalog.js';

const actionName = (action) => ACTIONS[action]?.text.en || action;

const sec = (s) => s * 1000;
const STEPUP_OPEN = ['self', 'pending_guardian', 'approved', 'cooloff', 'ready'];
const DECIDABLE = ['pending_guardian', 'cooloff'];

/**
 * The exact bytes a guardian signs. Binding the decision as well as the
 * request means a signed "deny" can never be replayed as an "approve".
 */
export function decisionChallenge(request, decision) {
  const action = request.type === 'recovery' ? 'recover_account' : request.action;
  const material = [request.id, action, request.userId, request.expiresAt, request.nonce, decision].join('|');
  return new Uint8Array(crypto.createHash('sha256').update(material).digest());
}

export const findRequest = (id) =>
  read().stepups.find((r) => r.id === id) || read().recoveries.find((r) => r.id === id);

function update(id, patch) {
  return write((db) => {
    const r = db.stepups.find((x) => x.id === id) || db.recoveries.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    return r;
  });
}

/** Public view of a request for the user, guardian or dashboard. Never secrets. */
export function view(r) {
  if (!r) return null;
  const user = r.userId ? findUser(r.userId) : null;
  return {
    id: r.id,
    type: r.type,
    action: r.type === 'recovery' ? 'recover_account' : r.action,
    userName: user?.name || r.nameTried || null,
    params: r.paramsMasked || null,
    score: r.score ?? null,
    reasons: r.reasons || [],
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    coolOffUntil: r.coolOffUntil || null,
    readyAt: r.readyAt || null,
    finishBy: r.finishBy || null,
    decidedBy: r.decidedByName || null,
    approvals: r.type === 'recovery' ? r.approvals.length : undefined,
    required: r.type === 'recovery' && r.approvals.length > 0 ? r.required : undefined,
  };
}

function broadcast(r, event = 'request') {
  const v = view(r);
  if (r.type === 'stepup') {
    publish(`user:${r.userId}`, event, v);
  } else {
    publish(`recovery:${r.id}`, event, v);
    // Existing sessions of the real owner get the cancel window.
    if (r.userId) publish(`user:${r.userId}`, 'recovery', v);
  }
  if (r.userId) for (const g of guardiansOf(r.userId)) publish(`guardian:${g.id}`, event, v);
}

// ---------- step-ups ----------

export function createStepup({ user, action, params, paramsMasked, risk }) {
  const now = Date.now();
  const guardians = guardiansOf(user.id);
  const needsGuardian = risk.high;
  const stepup = {
    id: newId('su_'),
    type: 'stepup',
    userId: user.id,
    action,
    params,
    paramsMasked,
    score: risk.score,
    reasons: risk.reasons,
    nonce: crypto.randomBytes(16).toString('base64url'),
    createdAt: now,
    expiresAt: now + sec(config.guardianWaitSeconds),
    status: 'self',
  };
  if (!needsGuardian) {
    stepup.finishBy = now + sec(config.finishWithinSeconds);
  } else if (guardians.length === 0) {
    // Nobody to ask: go straight to the delay instead of blocking forever.
    stepup.status = 'cooloff';
    stepup.coolOffUntil = now + sec(config.coolOffSeconds);
  } else {
    stepup.status = 'pending_guardian';
  }
  write((db) => db.stepups.push(stepup));

  if (needsGuardian) {
    logEvent('stepup.created', {
      userId: user.id,
      actor: user.name,
      summary: `${user.name}: "${actionName(action)}" paused (risk ${risk.score})`,
      detail: { action, score: risk.score, reasons: risk.reasons, guardians: guardians.length },
    });
    if (stepup.status === 'cooloff') coolOffStarted(stepup, 'no_guardian');
    broadcast(stepup);
  } else {
    logEvent('action.selfcheck', { userId: user.id, actor: user.name, summary: `${user.name}: "${actionName(action)}" needs passkey re-check (risk ${risk.score})` });
  }
  return stepup;
}

function coolOffStarted(r, why) {
  const user = findUser(r.userId);
  logEvent('stepup.cooloff', {
    userId: r.userId,
    actor: user?.name,
    summary: `${user?.name}: "${actionName(r.action)}" in cool-off until ${new Date(r.coolOffUntil).toLocaleTimeString()} (${why})`,
    detail: { why },
  });
}

export function canFinish(r) {
  return r && r.type === 'stepup' && ['self', 'approved', 'ready'].includes(r.status) && (!r.finishBy || Date.now() <= r.finishBy);
}

export function completeStepup(r) {
  const updated = update(r.id, { status: 'completed', completedAt: Date.now() });
  broadcast(updated);
  return updated;
}

export function cancelStepup(r, user) {
  if (!STEPUP_OPEN.includes(r.status)) return r;
  const updated = update(r.id, { status: 'cancelled' });
  logEvent('stepup.cancelled', { userId: user.id, actor: user.name, summary: `${user.name} cancelled "${actionName(r.action)}"` });
  broadcast(updated);
  return updated;
}

// ---------- recoveries ----------

/**
 * Always creates a record, even for an unknown name, so the response is
 * identical either way (no account enumeration). Unknown ones never progress.
 */
export function createRecovery(nameTried, user) {
  const now = Date.now();
  const guardians = user ? guardiansOf(user.id) : [];
  const rec = {
    id: newId('rc_'),
    type: 'recovery',
    userId: user?.id || null,
    nameTried: user ? null : String(nameTried).slice(0, 40),
    nonce: crypto.randomBytes(16).toString('base64url'),
    createdAt: now,
    expiresAt: now + sec(24 * 3600),
    status: 'pending_guardian',
    approvals: [],
    required: guardians.length >= 2 ? 2 : 1,
  };
  write((db) => db.recoveries.push(rec));
  logEvent('recovery.started', {
    userId: rec.userId,
    summary: user ? `Recovery requested for ${user.name} (${guardians.length} guardian(s) asked)` : 'Recovery requested for an unknown name (silently ignored)',
  });
  if (user) broadcast(rec);
  return rec;
}

export function canRegisterRecovered(r) {
  return r && r.type === 'recovery' && r.status === 'ready' && r.userId;
}

export function completeRecovery(r) {
  const updated = update(r.id, { status: 'completed', completedAt: Date.now() });
  const user = findUser(r.userId);
  logEvent('recovery.completed', { userId: r.userId, actor: user?.name, summary: `${user?.name} registered a new passkey after recovery` });
  broadcast(updated);
  return updated;
}

export function cancelRecovery(r, user) {
  if (!['pending_guardian', 'cancel_window', 'ready'].includes(r.status)) return r;
  const updated = update(r.id, { status: 'cancelled' });
  logEvent('recovery.cancelled', { userId: user.id, actor: user.name, summary: `${user.name} cancelled a recovery of their account` });
  broadcast(updated);
  return updated;
}

// ---------- guardian decisions ----------

export function isDecidable(r, guardian) {
  if (!r || !r.userId || !guardian.guards.includes(r.userId)) return false;
  if (r.type === 'recovery' && r.approvals.includes(guardian.id)) return false;
  return DECIDABLE.includes(r.status);
}

export function applyDecision(r, guardian, decision) {
  const user = findUser(r.userId);
  const now = Date.now();
  let updated;
  if (r.type === 'stepup') {
    updated = decision === 'approve'
      ? update(r.id, { status: 'approved', decidedBy: guardian.id, decidedByName: guardian.name, decidedAt: now, finishBy: now + sec(config.finishWithinSeconds) })
      : update(r.id, { status: 'denied', decidedBy: guardian.id, decidedByName: guardian.name, decidedAt: now });
    logEvent(decision === 'approve' ? 'stepup.approved' : 'stepup.denied', {
      userId: r.userId,
      actor: guardian.name,
      summary: `${guardian.name} ${decision === 'approve' ? 'approved' : 'denied'} "${actionName(r.action)}" for ${user?.name} (signed with passkey)`,
      detail: { requestId: r.id, decision },
    });
  } else if (decision === 'deny') {
    updated = update(r.id, { status: 'denied', decidedByName: guardian.name, decidedAt: now });
    logEvent('recovery.denied', { userId: r.userId, actor: guardian.name, summary: `${guardian.name} denied a recovery of ${user?.name}'s account` });
  } else {
    const approvals = [...r.approvals, guardian.id];
    const enough = approvals.length >= r.required;
    updated = update(r.id, {
      approvals,
      decidedByName: guardian.name,
      ...(enough ? { status: 'cancel_window', readyAt: now + sec(config.recoveryDelaySeconds) } : {}),
    });
    logEvent('recovery.approved', {
      userId: r.userId,
      actor: guardian.name,
      summary: `${guardian.name} approved recovery of ${user?.name}'s account (${approvals.length}/${r.required})`,
    });
  }
  broadcast(updated);
  return updated;
}

export function pendingFor(guardian) {
  const mine = (r) => r.userId && guardian.guards.includes(r.userId) && isDecidable(r, guardian);
  const db = read();
  return [...db.stepups.filter(mine), ...db.recoveries.filter(mine)].map(view);
}

// ---------- clock ----------

/** Moves time-based transitions forward. Called every second. */
export function tick() {
  const now = Date.now();
  const changed = [];
  const db = read();
  {
    for (const r of db.stepups) {
      if (r.status === 'pending_guardian' && now >= r.expiresAt) {
        r.status = 'cooloff';
        r.coolOffUntil = now + sec(config.coolOffSeconds);
        changed.push([r, 'no_answer']);
      } else if (r.status === 'cooloff' && now >= r.coolOffUntil) {
        r.status = 'ready';
        r.finishBy = now + sec(config.finishWithinSeconds);
        changed.push([r]);
      } else if (['self', 'approved', 'ready'].includes(r.status) && r.finishBy && now > r.finishBy) {
        r.status = 'expired';
        changed.push([r]);
      }
    }
    for (const r of db.recoveries) {
      if (r.status === 'cancel_window' && now >= r.readyAt) {
        r.status = 'ready';
        changed.push([r]);
      }
    }
  }
  if (changed.length === 0) return;
  write(() => {}); // persist the in-place changes above
  for (const [r, why] of changed) {
    if (why) coolOffStarted(r, why);
    broadcast(r);
  }
}
