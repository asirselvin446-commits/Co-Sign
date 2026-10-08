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
};

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

export interface ReplayResult {
  assessed: number;
  guardedBefore: number;
  guardedAfter: number;
  newlyGuarded: number;
  noLongerGuarded: number;
  /** Rules the draft turns on that were off in the active set, so past matches were never recorded. */
  unobservable: RiskRuleKey[];
}

function scoreKeys(set: Pick<RuleSet, 'rules'>, keys: readonly string[]): number {
  let score = 0;
  for (const key of keys) {
    const rule = set.rules.find((r) => r.key === key);
    if (rule?.enabled && rule.weight > 0) score += rule.weight;
  }
  return score;
}

/**
 * Re-score past assessments (the rule keys each one matched) under the active and a draft rule set.
 * Only weights and thresholds can be replayed: predicates are not re-run, so a rule that was off
 * when an assessment happened never shows up in its keys.
 */
export function replayRuleSets(active: Omit<RuleSet, 'version'>, draft: Omit<RuleSet, 'version'>, history: ReadonlyArray<readonly string[]>): ReplayResult {
  const result: ReplayResult = { assessed: history.length, guardedBefore: 0, guardedAfter: 0, newlyGuarded: 0, noLongerGuarded: 0, unobservable: [] };
  for (const keys of history) {
    const before = scoreKeys(active, keys) >= active.guardianThreshold;
    const after = scoreKeys(draft, keys) >= draft.guardianThreshold;
    if (before) result.guardedBefore++;
    if (after) result.guardedAfter++;
    if (after && !before) result.newlyGuarded++;
    if (before && !after) result.noLongerGuarded++;
  }
  const isOn = (r: RuleConfig | undefined) => !!r && r.enabled && r.weight > 0;
  result.unobservable = draft.rules.filter((r) => isOn(r) && !isOn(active.rules.find((a) => a.key === r.key))).map((r) => r.key);
  return result;
}
