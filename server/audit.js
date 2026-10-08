// Append-only audit log. Every security decision lands here and on the dashboard.
import { write, read, newId } from './db.js';
import { publish } from './sse.js';

const MAX_EVENTS = 1000;

// Which dashboard counter each event type feeds.
const COUNTER_OF = {
  'login.success': 'logins',
  'login.failure': 'failures',
  'otp.failure': 'failures',
  'client.failure': 'failures',
  'stepup.created': 'stepups',
  'stepup.approved': 'approved',
  'recovery.approved': 'approved',
  'stepup.denied': 'denied',
  'recovery.denied': 'denied',
  'recovery.started': 'recoveries',
};

export const COUNTERS = ['logins', 'failures', 'stepups', 'approved', 'denied', 'recoveries'];

/**
 * @param {string} type  e.g. 'stepup.denied'
 * @param {object} info  { userId?, actor?, summary, detail? } — never secrets.
 */
export function logEvent(type, info = {}) {
  const event = {
    id: newId('ev_'),
    ts: Date.now(),
    type,
    counter: COUNTER_OF[type] || null,
    userId: info.userId || null,
    actor: info.actor || null,
    summary: info.summary || type,
    detail: info.detail || null,
  };
  write((db) => {
    db.events.push(event);
    if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
    // Counters live outside the capped log so they never go backwards.
    db.counters ||= {};
    if (event.counter) db.counters[event.counter] = (db.counters[event.counter] || 0) + 1;
  });
  publish('dashboard', 'audit', { event, counters: counters() });
  return event;
}

export function counters() {
  const stored = read().counters || {};
  return Object.fromEntries(COUNTERS.map((c) => [c, stored[c] || 0]));
}

export function recentFailures(userId, windowMs = 15 * 60 * 1000) {
  const since = Date.now() - windowMs;
  return read().events.filter((e) => e.userId === userId && e.counter === 'failures' && e.ts >= since).length;
}
