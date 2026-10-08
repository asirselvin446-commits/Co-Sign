// Explainable rules-based risk engine. Every point added has a reason code
// whose plain-language text (en/ta/hi) lives in public/js/catalog.js.
import { RISK_RULES, RISK_THRESHOLD } from '../public/js/catalog.js';
import { recentFailures } from './audit.js';

const NEW_DEVICE_MS = 10 * 60 * 1000;
const OTP_PASTE_MEMORY_MS = 10 * 60 * 1000;

export const SIGNAL_KEYS = ['unknownCall', 'remoteAccess', 'screenShare', 'simChanged'];

const CHECKS = {
  unknown_call: (c) => c.signals.unknownCall,
  remote_access: (c) => c.signals.remoteAccess,
  screen_share: (c) => c.signals.screenShare,
  sim_changed: (c) => c.signals.simChanged,
  otp_pasted: (c) => c.otpPastedAt && c.now - c.otpPastedAt < OTP_PASTE_MEMORY_MS,
  new_device: (c) => c.credCreatedAt && c.now - c.credCreatedAt < NEW_DEVICE_MS,
  odd_hour: (c) => new Date(c.now).getHours() < 5,
  recent_failures: (c) => c.failures >= 3,
};

/**
 * @param user     stored user (holds device signals + otpPastedAt)
 * @param session  express session (knows which passkey signed in, and when it was made)
 */
export function assess(user, session) {
  const ctx = {
    now: Date.now(),
    signals: user.signals || {},
    otpPastedAt: user.otpPastedAt,
    credCreatedAt: session?.credCreatedAt,
    failures: recentFailures(user.id),
  };
  const reasons = RISK_RULES.filter((r) => CHECKS[r.code](ctx)).map((r) => r.code);
  const score = RISK_RULES.filter((r) => reasons.includes(r.code)).reduce((s, r) => s + r.points, 0);
  return { score, reasons, threshold: RISK_THRESHOLD, high: score >= RISK_THRESHOLD };
}
