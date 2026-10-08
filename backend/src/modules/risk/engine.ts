import { z } from 'zod';
import { RISK_RULE_DEFAULTS, type Lang, type RiskRuleKey } from '../../generated/catalog.js';

/**
 * Signals reported by the device. Only booleans, small integers and hashes: never phone numbers,
 * contact names or app lists.
 */
export const deviceSignalsSchema = z.object({
  collectedAt: z.iso.datetime(),
  platform: z.enum(['android', 'ios']),
  call: z
    .object({
      active: z.boolean(),
      durationSec: z.number().int().min(0).max(24 * 3600),
      numberKnown: z.enum(['known', 'unknown', 'unavailable']),
    })
    .optional(),
  remoteAccess: z.object({ installed: z.boolean(), active: z.boolean() }).optional(),
  screen: z.object({ captureDetected: z.boolean(), recordingActive: z.boolean() }).optional(),
  /** Salted SHA-256 of subscription IDs and carrier, computed on the phone. */
  sim: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
  integrity: z.object({ token: z.string().min(10).max(16_384), requestHash: z.string().min(16).max(128) }).optional(),
  behaviour: z
    .object({
      codePasted: z.boolean(),
      localHour: z.number().int().min(0).max(23),
    })
    .optional(),
  /** Which permissions the person granted, so staff can see signal coverage. */
  coverage: z
    .object({
      phoneState: z.boolean(),
      callLog: z.boolean(),
      contacts: z.boolean(),
      usageStats: z.boolean(),
    })
    .optional(),
});
export type DeviceSignals = z.infer<typeof deviceSignalsSchema>;

/** Facts the server derives itself. */
export interface ServerFacts {
  deviceEnrolledAt: Date;
  simChangedAt: Date | null;
  recentFailures: number;
  integrity: 'pass' | 'fail' | 'unavailable';
  now: Date;
  /** Critical family-protection alerts on this account in the last 30 minutes. */
  recentFamilyAlerts?: number;
  /** For money movement: the amount, and this person's typical (median) outgoing payment. */
  amountMinor?: bigint | null;
  typicalAmountMinor?: bigint | null;
  /** For money movement: how long ago the payee was added. */
  payeeAgeHours?: number | null;
}

export interface RuleConfig {
  key: RiskRuleKey;
  weight: number;
  enabled: boolean;
  reasons: Record<Lang, string>;
}

export interface RuleSet {
  version: number;
  guardianThreshold: number;
  rules: RuleConfig[];
}

export interface MatchedRule {
  key: RiskRuleKey;
  weight: number;
  reason: string;
}

export interface Evaluation {
  score: number;
  needsGuardian: boolean;
  matched: MatchedRule[];
  ruleSetVersion: number;
}

export const DEFAULT_GUARDIAN_THRESHOLD = 50;

export function defaultRuleSet(): RuleSet {
  return {
    version: 0,
    guardianThreshold: DEFAULT_GUARDIAN_THRESHOLD,
    rules: (Object.keys(RISK_RULE_DEFAULTS) as RiskRuleKey[]).map((key) => ({
      key,
      weight: RISK_RULE_DEFAULTS[key].weight,
      enabled: true,
      reasons: { ...RISK_RULE_DEFAULTS[key].reasons },
    })),
  };
}

const HOUR = 3600 * 1000;

/** Each rule is a pure predicate over device signals and server facts. */
export const PREDICATES: Record<RiskRuleKey, (s: DeviceSignals | null, f: ServerFacts) => boolean> = {
  call_unknown_number: (s) => !!s?.call?.active && s.call.numberKnown !== 'known',
  remote_access_app: (s) => !!s?.remoteAccess && (s.remoteAccess.installed || s.remoteAccess.active),
  screen_capture: (s) => !!s?.screen && (s.screen.captureDetected || s.screen.recordingActive),
  sim_changed_72h: (_s, f) => !!f.simChangedAt && f.now.getTime() - f.simChangedAt.getTime() < 72 * HOUR,
  code_pasted: (s) => !!s?.behaviour?.codePasted,
  new_device_24h: (_s, f) => f.now.getTime() - f.deviceEnrolledAt.getTime() < 24 * HOUR,
  late_night: (s) => s?.behaviour !== undefined && s.behaviour.localHour >= 0 && s.behaviour.localHour < 5,
  repeated_failures: (_s, f) => f.recentFailures >= 3,
  integrity_failed: (_s, f) => f.integrity === 'fail',
  recent_family_alert: (_s, f) => (f.recentFamilyAlerts ?? 0) > 0,
  unusual_amount: (_s, f) => isUnusualAmount(f.amountMinor ?? null, f.typicalAmountMinor ?? null),
  new_payee_recent: (_s, f) => f.payeeAgeHours !== null && f.payeeAgeHours !== undefined && f.payeeAgeHours < 24,
};

/**
 * A payment is unusual when it is at least three times this person's median payment. Without
 * enough history (null typical amount) nothing is flagged here; the daily limit still applies.
 */
export function isUnusualAmount(amount: bigint | null, typical: bigint | null): boolean {
  if (amount === null || typical === null || typical <= 0n) return false;
  return amount >= typical * 3n;
}

/**
 * Score = sum of the weights of matching, enabled rules. Every point is explained by a reason
 * string in the requested language. Score >= threshold means a guardian must approve.
 */
export function evaluate(ruleSet: RuleSet, signals: DeviceSignals | null, facts: ServerFacts, lang: Lang = 'en'): Evaluation {
  const matched: MatchedRule[] = [];
  for (const rule of ruleSet.rules) {
    if (!rule.enabled || rule.weight <= 0) continue;
    const predicate = PREDICATES[rule.key];
    if (predicate && predicate(signals, facts)) {
      matched.push({ key: rule.key, weight: rule.weight, reason: rule.reasons[lang] ?? rule.reasons.en });
    }
  }
  matched.sort((a, b) => b.weight - a.weight);
  const score = matched.reduce((sum, m) => sum + m.weight, 0);
  return { score, needsGuardian: score >= ruleSet.guardianThreshold, matched, ruleSetVersion: ruleSet.version };
}

export const ruleSetSchema = z.object({
  guardianThreshold: z.number().int().min(1).max(500),
  rules: z
    .array(
      z.object({
        key: z.enum(Object.keys(RISK_RULE_DEFAULTS) as [RiskRuleKey, ...RiskRuleKey[]]),
        weight: z.number().int().min(0).max(200),
        enabled: z.boolean(),
        reasons: z.object({
          en: z.string().trim().min(5).max(300),
          ta: z.string().trim().min(5).max(300),
          hi: z.string().trim().min(5).max(300),
        }),
      }),
    )
    .refine((rules) => new Set(rules.map((r) => r.key)).size === rules.length, 'each rule may appear once'),
});
