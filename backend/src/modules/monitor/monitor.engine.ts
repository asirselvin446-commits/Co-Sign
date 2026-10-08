import { z } from 'zod';
import { MONITOR_RULES, type Lang, type MonitorRuleKey } from '../../generated/catalog.js';

/**
 * Family monitoring: events observed on a protected person's phone, scored by explainable rules.
 * The same rules run on the phone (Kotlin MonitorRules) so a pause screen can appear instantly and
 * offline; both implementations are checked against shared/monitor-vectors.json.
 *
 * Privacy: events carry categories, flags and amount ranges only. No message text, phone numbers,
 * screen contents or exact amounts ever leave the phone.
 */

export const APP_CATEGORIES = ['bank', 'upi', 'wallet', 'email', 'social', 'remote_access', 'other'] as const;
export const AMOUNT_BUCKETS = ['lt_1k', '1k_10k', '10k_50k', '50k_1l', 'gt_1l'] as const;
export type AmountBucket = (typeof AMOUNT_BUCKETS)[number];

export const MONITOR_KINDS = [
  'app_foreground',
  'login_screen',
  'payment_screen',
  'notification_login',
  'notification_otp',
  'notification_debit',
  'notification_credit',
  'call_update',
  'pause_dismissed',
] as const;

export const callContextSchema = z.object({
  active: z.boolean(),
  durationSec: z.number().int().min(0).max(24 * 3600),
  caller: z.enum(['known', 'unknown', 'hidden', 'international', 'unavailable']),
  /** Calls from the same unknown number in the last two hours (number hashed on the phone). */
  repeatCount: z.number().int().min(0).max(100).default(0),
});

export const monitorEventSchema = z.object({
  /** Random ID chosen by the phone, so retried uploads are not double counted. */
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  kind: z.enum(MONITOR_KINDS),
  occurredAt: z.iso.datetime(),
  app: z
    .object({
      package: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/).max(150),
      category: z.enum(APP_CATEGORIES),
    })
    .nullable()
    .default(null),
  amountBucket: z.enum(AMOUNT_BUCKETS).nullable().default(null),
  call: callContextSchema.nullable().default(null),
  localHour: z.number().int().min(0).max(23),
  /** The phone already showed the pause screen for this event. */
  paused: z.boolean().default(false),
});
export type MonitorEvent = z.infer<typeof monitorEventSchema>;
export type MonitorEventInput = z.input<typeof monitorEventSchema>;

export interface MonitorContext {
  /** Largest debit range this person normally has (last 60 days), or null if no history. */
  usualMaxDebitBucket: AmountBucket | null;
}

export type Severity = 'info' | 'warn' | 'critical';

export interface MonitorAssessment {
  score: number;
  severity: Severity;
  /** Rule keys in descending weight order. */
  rules: MonitorRuleKey[];
  /** Show the pause screen (critical while a sensitive action is under way). */
  pause: boolean;
}

export const WARN_AT = 30;
export const CRITICAL_AT = 60;
const SENSITIVE: ReadonlyArray<string> = ['bank', 'upi', 'wallet'];
const LOGIN_SENSITIVE: ReadonlyArray<string> = ['bank', 'upi', 'wallet', 'email'];

export function bucketIndex(b: AmountBucket | null): number {
  return b === null ? -1 : AMOUNT_BUCKETS.indexOf(b);
}

/** On a call with someone who is not a saved contact, for at least a minute. */
export function riskyCall(c: MonitorEvent['call']): boolean {
  return !!c && c.active && c.caller !== 'known' && c.durationSec >= 60;
}

export function assessMonitorEvent(e: MonitorEvent, ctx: MonitorContext): MonitorAssessment {
  const hit = new Set<MonitorRuleKey>();
  const onRiskyCall = riskyCall(e.call);
  const category = e.app?.category ?? null;

  switch (e.kind) {
    case 'payment_screen':
      if (onRiskyCall) hit.add('payment_screen_during_call');
      break;
    case 'login_screen':
      if (onRiskyCall && category && LOGIN_SENSITIVE.includes(category)) hit.add('login_screen_during_call');
      break;
    case 'app_foreground':
      if (category === 'remote_access') {
        hit.add('remote_access_active');
        if (onRiskyCall) hit.add('remote_access_during_call');
      } else if (onRiskyCall && category && SENSITIVE.includes(category)) {
        hit.add('sensitive_app_during_call');
      }
      break;
    case 'notification_otp':
      if (onRiskyCall) hit.add('otp_during_call');
      break;
    case 'notification_login':
      hit.add('new_login_alert');
      if (onRiskyCall) hit.add('login_alert_during_call');
      break;
    case 'notification_debit': {
      const idx = bucketIndex(e.amountBucket);
      if (idx >= bucketIndex('10k_50k')) hit.add('large_debit');
      // Unusual for this person, or very large when there is no history to compare with yet.
      const usual = ctx.usualMaxDebitBucket;
      if ((usual !== null && idx > bucketIndex(usual)) || (usual === null && idx >= bucketIndex('50k_1l'))) hit.add('unusual_debit');
      break;
    }
    default:
      break;
  }

  // Call patterns count on every event that reports the call, so a long scam call raises an alert
  // even if nothing else happens on the phone.
  const c = e.call;
  if (c?.active && c.caller !== 'known') {
    if (c.durationSec >= 15 * 60 && c.caller !== 'unavailable') hit.add('long_unknown_call');
    if (c.durationSec >= 45 * 60 && c.caller !== 'unavailable') hit.add('very_long_unknown_call');
    if (c.caller === 'hidden' || c.caller === 'international') hit.add('hidden_or_international_caller');
    if (c.repeatCount >= 3) hit.add('repeated_unknown_caller');
  }

  if (hit.size > 0 && e.localHour < 5) hit.add('late_night_activity');

  const rules = [...hit].sort((a, b) => MONITOR_RULES[b].weight - MONITOR_RULES[a].weight || a.localeCompare(b));
  const score = rules.reduce((s, k) => s + MONITOR_RULES[k].weight, 0);
  const severity: Severity = score >= CRITICAL_AT ? 'critical' : score >= WARN_AT ? 'warn' : 'info';
  const sensitiveMoment = e.kind === 'payment_screen' || e.kind === 'login_screen' || e.kind === 'notification_otp' || (e.kind === 'app_foreground' && category !== null && category !== 'other');
  return { score, severity, rules, pause: severity === 'critical' && sensitiveMoment };
}

export function monitorReasons(rules: string[], lang: Lang): Array<{ key: string; weight: number; reason: string }> {
  return rules
    .filter((k): k is MonitorRuleKey => k in MONITOR_RULES)
    .map((k) => ({ key: k, weight: MONITOR_RULES[k].weight, reason: MONITOR_RULES[k].reasons[lang] }));
}
