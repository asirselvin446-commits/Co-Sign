import { describe, expect, it } from 'vitest';
import { defaultRuleSet, evaluate, isUnusualAmount, ruleSetSchema, type DeviceSignals, type ServerFacts } from '../../src/modules/risk/engine.js';

const now = new Date('2026-10-08T12:00:00Z');
const facts = (over: Partial<ServerFacts> = {}): ServerFacts => ({
  deviceEnrolledAt: new Date('2026-01-01T00:00:00Z'),
  simChangedAt: null,
  recentFailures: 0,
  integrity: 'pass',
  now,
  ...over,
});
const signals = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({
  collectedAt: now.toISOString(),
  platform: 'android',
  behaviour: { codePasted: false, localHour: 14 },
  ...over,
});

describe('risk engine defaults', () => {
  const rules = defaultRuleSet();

  it('uses the specified default weights and threshold', () => {
    const w = Object.fromEntries(rules.rules.map((r) => [r.key, r.weight]));
    expect(w).toEqual({
      call_unknown_number: 40,
      remote_access_app: 30,
      screen_capture: 30,
      sim_changed_72h: 30,
      code_pasted: 15,
      new_device_24h: 20,
      late_night: 10,
      repeated_failures: 15,
      integrity_failed: 40,
      recent_family_alert: 30,
      unusual_amount: 25,
      new_payee_recent: 20,
    });
    expect(rules.guardianThreshold).toBe(50);
  });

  it('scores a calm situation as zero', () => {
    const r = evaluate(rules, signals(), facts());
    expect(r.score).toBe(0);
    expect(r.needsGuardian).toBe(false);
    expect(r.matched).toEqual([]);
  });

  it('flags the classic coached-victim pattern: unknown caller + remote access app', () => {
    const r = evaluate(
      rules,
      signals({ call: { active: true, durationSec: 600, numberKnown: 'unknown' }, remoteAccess: { installed: true, active: false } }),
      facts(),
    );
    expect(r.score).toBe(70);
    expect(r.needsGuardian).toBe(true);
    expect(r.matched.map((m) => m.key)).toEqual(['call_unknown_number', 'remote_access_app']);
  });

  it('treats "number unavailable" (permission denied) like unknown, and a known caller as safe', () => {
    expect(evaluate(rules, signals({ call: { active: true, durationSec: 5, numberKnown: 'unavailable' } }), facts()).score).toBe(40);
    expect(evaluate(rules, signals({ call: { active: true, durationSec: 5, numberKnown: 'known' } }), facts()).score).toBe(0);
    expect(evaluate(rules, signals({ call: { active: false, durationSec: 0, numberKnown: 'unknown' } }), facts()).score).toBe(0);
  });

  it('applies the threshold at exactly 50', () => {
    // 40 (call) + 10 (late night) = 50 -> guardian
    const r = evaluate(rules, signals({ call: { active: true, durationSec: 1, numberKnown: 'unknown' }, behaviour: { codePasted: false, localHour: 2 } }), facts());
    expect(r.score).toBe(50);
    expect(r.needsGuardian).toBe(true);
    // 30 + 15 = 45 -> passkey only
    const r2 = evaluate(rules, signals({ screen: { captureDetected: true, recordingActive: false }, behaviour: { codePasted: true, localHour: 14 } }), facts());
    expect(r2.score).toBe(45);
    expect(r2.needsGuardian).toBe(false);
  });

  it('uses server facts: SIM change within 72h, new device within 24h, failures, integrity', () => {
    const r = evaluate(
      rules,
      null,
      facts({
        simChangedAt: new Date(now.getTime() - 71 * 3600_000),
        deviceEnrolledAt: new Date(now.getTime() - 3600_000),
        recentFailures: 3,
        integrity: 'fail',
      }),
    );
    expect(r.matched.map((m) => m.key).sort()).toEqual(['integrity_failed', 'new_device_24h', 'repeated_failures', 'sim_changed_72h']);
    expect(r.score).toBe(30 + 20 + 15 + 40);
    expect(evaluate(rules, null, facts({ simChangedAt: new Date(now.getTime() - 73 * 3600_000) })).score).toBe(0);
    expect(evaluate(rules, null, facts({ recentFailures: 2 })).score).toBe(0);
    expect(evaluate(rules, null, facts({ integrity: 'unavailable' })).score).toBe(0);
  });

  it('late night is 00:00 to 04:59 local time', () => {
    expect(evaluate(rules, signals({ behaviour: { codePasted: false, localHour: 0 } }), facts()).score).toBe(10);
    expect(evaluate(rules, signals({ behaviour: { codePasted: false, localHour: 4 } }), facts()).score).toBe(10);
    expect(evaluate(rules, signals({ behaviour: { codePasted: false, localHour: 5 } }), facts()).score).toBe(0);
    expect(evaluate(rules, signals({ behaviour: { codePasted: false, localHour: 23 } }), facts()).score).toBe(0);
  });

  it('explains every point in the requested language', () => {
    const s = signals({ screen: { captureDetected: false, recordingActive: true } });
    for (const lang of ['en', 'ta', 'hi'] as const) {
      const r = evaluate(rules, s, facts(), lang);
      expect(r.matched).toHaveLength(1);
      expect(r.matched[0]!.reason).toBe(rules.rules.find((x) => x.key === 'screen_capture')!.reasons[lang]);
    }
    expect(evaluate(rules, s, facts(), 'ta').matched[0]!.reason).toMatch(/[஀-௿]/);
    expect(evaluate(rules, s, facts(), 'hi').matched[0]!.reason).toMatch(/[ऀ-ॿ]/);
  });

  it('respects disabled rules and edited weights', () => {
    const edited = { ...rules, guardianThreshold: 60, rules: rules.rules.map((r) => (r.key === 'call_unknown_number' ? { ...r, weight: 70 } : r.key === 'remote_access_app' ? { ...r, enabled: false } : r)) };
    const r = evaluate(edited, signals({ call: { active: true, durationSec: 1, numberKnown: 'unknown' }, remoteAccess: { installed: true, active: true } }), facts());
    expect(r.score).toBe(70);
    expect(r.needsGuardian).toBe(true);
  });
});

describe('context rules (accuracy)', () => {
  const rules = defaultRuleSet();
  it('adds points for a recent family-protection alert', () => {
    expect(evaluate(rules, null, facts({ recentFamilyAlerts: 1 })).matched.map((m) => m.key)).toEqual(['recent_family_alert']);
  });
  it('flags payments at least three times the usual size, but only with history', () => {
    expect(isUnusualAmount(30_000n, 10_000n)).toBe(true);
    expect(isUnusualAmount(29_999n, 10_000n)).toBe(false);
    expect(isUnusualAmount(1_000_000n, null)).toBe(false);
    const r = evaluate(rules, null, facts({ amountMinor: 900_000n, typicalAmountMinor: 50_000n, payeeAgeHours: 2 }));
    expect(r.matched.map((m) => m.key)).toEqual(['unusual_amount', 'new_payee_recent']);
    expect(r.score).toBe(45);
  });
  it('a coached victim paying a brand-new payee a large sum during a scam call needs a guardian', () => {
    const r = evaluate(
      rules,
      signals({ call: { active: true, durationSec: 900, numberKnown: 'unknown' } }),
      facts({ amountMinor: 4_500_000n, typicalAmountMinor: 120_000n, payeeAgeHours: 0.2 }),
    );
    expect(r.score).toBe(85);
    expect(r.needsGuardian).toBe(true);
  });
});

describe('rule set validation', () => {
  it('accepts the defaults and rejects duplicates or out-of-range values', () => {
    const d = defaultRuleSet();
    expect(ruleSetSchema.safeParse({ guardianThreshold: d.guardianThreshold, rules: d.rules }).success).toBe(true);
    expect(ruleSetSchema.safeParse({ guardianThreshold: 50, rules: [d.rules[0], d.rules[0]] }).success).toBe(false);
    expect(ruleSetSchema.safeParse({ guardianThreshold: 0, rules: d.rules }).success).toBe(false);
    expect(ruleSetSchema.safeParse({ guardianThreshold: 50, rules: [{ ...d.rules[0]!, weight: 999 }] }).success).toBe(false);
  });
});
