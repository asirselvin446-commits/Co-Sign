import type { Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { Lang } from '../../generated/catalog.js';
import { randomToken } from '../../lib/crypto.js';
import type { CredentialsService } from '../auth/credentials.service.js';
import { defaultRuleSet, evaluate, type DeviceSignals, type Evaluation, type RuleConfig, type RuleSet } from './engine.js';

export const SIGNAL_CONSENT_PURPOSE = 'risk_signals';
export const ctxSignalPayload = (id: string) => `signal.payload:${id}`;

const CACHE_MS = 5000;
const SIGNAL_CACHE_TTL = 60;
const signalCacheKey = (deviceId: string) => `sig:${deviceId}`;
const integrityKey = (deviceId: string, hash: string) => `integ:${deviceId}:${hash}`;

export interface Assessment extends Evaluation {
  signals: DeviceSignals | null;
  consented: boolean;
}

export class RiskService {
  private cached: { at: number; set: RuleSet } | null = null;

  constructor(
    private readonly deps: Deps,
    private readonly credentials: CredentialsService,
  ) {}

  // ---------------------------------------------------------------- rule sets

  async activeRuleSet(): Promise<RuleSet> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.set;
    let row = await this.deps.prisma.riskRuleSet.findFirst({ orderBy: { version: 'desc' } });
    if (!row) {
      const d = defaultRuleSet();
      try {
        row = await this.deps.prisma.riskRuleSet.create({
          data: { version: 1, rules: d.rules as unknown as Prisma.InputJsonValue, guardianThreshold: d.guardianThreshold, note: 'Default rules' },
        });
      } catch (e) {
        // Another instance seeded the defaults first.
        if ((e as { code?: string }).code !== 'P2002') throw e;
        row = await this.deps.prisma.riskRuleSet.findFirstOrThrow({ orderBy: { version: 'desc' } });
      }
    }
    const set: RuleSet = { version: row.version, guardianThreshold: row.guardianThreshold, rules: row.rules as unknown as RuleConfig[] };
    this.cached = { at: Date.now(), set };
    return set;
  }

  async publishRuleSet(adminId: string, input: { guardianThreshold: number; rules: RuleConfig[]; note?: string }): Promise<RuleSet> {
    const current = await this.activeRuleSet();
    const version = await this.deps.audit.transaction(async (tx, log) => {
      // Lock the latest version row so two editors cannot publish the same version number.
      const latest = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM risk_rule_sets ORDER BY version DESC LIMIT 1 FOR UPDATE`;
      const next = (latest[0]?.version ?? 0) + 1;
      await tx.riskRuleSet.create({
        data: {
          version: next,
          rules: input.rules as unknown as Prisma.InputJsonValue,
          guardianThreshold: input.guardianThreshold,
          note: input.note ?? null,
          createdById: adminId,
        },
      });
      const changes = input.rules
        .map((r) => {
          const before = current.rules.find((c) => c.key === r.key);
          return before && (before.weight !== r.weight || before.enabled !== r.enabled) ? { key: r.key, from: before.weight, to: r.weight, enabled: r.enabled } : null;
        })
        .filter(Boolean);
      await log({
        actorType: 'admin',
        actorId: adminId,
        action: 'risk.rules_published',
        subjectType: 'risk_rule_set',
        subjectId: String(next),
        payload: { version: next, previous: current.version, threshold: input.guardianThreshold, changes },
      });
      return next;
    });
    this.cached = null;
    return { version, guardianThreshold: input.guardianThreshold, rules: input.rules };
  }

  // ---------------------------------------------------------------- consent

  async hasSignalConsent(userId: string): Promise<boolean> {
    const latest = await this.deps.prisma.consent.findFirst({
      where: { userId, purpose: SIGNAL_CONSENT_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    return latest?.granted ?? false;
  }

  // ---------------------------------------------------------------- integrity

  /** Issue a single-use request hash the app must embed in its Play Integrity request. */
  async integrityChallenge(deviceId: string): Promise<string> {
    const hash = randomToken(24);
    await this.deps.redis.set(integrityKey(deviceId, hash), '1', 'EX', 300);
    return hash;
  }

  private async integrityVerdict(deviceId: string, signals: DeviceSignals | null): Promise<'pass' | 'fail' | 'unavailable'> {
    const { prisma, redis, integrity } = this.deps;
    if (signals?.integrity && integrity.enabled) {
      const issued = await redis.getdel(integrityKey(deviceId, signals.integrity.requestHash));
      if (!issued) return 'fail'; // replayed or forged request hash
      const verdict = await integrity.verify(signals.integrity.token, signals.integrity.requestHash);
      if (verdict.status !== 'unavailable') {
        await prisma.device.update({ where: { id: deviceId }, data: { integrityVerdict: verdict.status, integrityAt: new Date() } });
      }
      return verdict.status;
    }
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { integrityVerdict: true, integrityAt: true } });
    if (device?.integrityAt && Date.now() - device.integrityAt.getTime() < 3600_000) {
      return device.integrityVerdict === 'fail' ? 'fail' : device.integrityVerdict === 'pass' ? 'pass' : 'unavailable';
    }
    return 'unavailable';
  }

  // ---------------------------------------------------------------- assessment

  /** Cache the latest device signals briefly (streamed every 15 s while a sensitive screen is open). */
  async cacheSignals(deviceId: string, signals: DeviceSignals): Promise<void> {
    const { integrity: _omit, ...rest } = signals;
    await this.deps.redis.set(signalCacheKey(deviceId), JSON.stringify(rest), 'EX', SIGNAL_CACHE_TTL);
  }

  async cachedSignals(deviceId: string): Promise<DeviceSignals | null> {
    const raw = await this.deps.redis.get(signalCacheKey(deviceId));
    return raw ? (JSON.parse(raw) as DeviceSignals) : null;
  }

  async assess(input: {
    userId: string;
    deviceId: string;
    signals?: DeviceSignals | null;
    lang: Lang;
    context: string;
    stepupRequestId?: string;
    persist?: boolean;
  }): Promise<Assessment> {
    const { prisma } = this.deps;
    const consented = await this.hasSignalConsent(input.userId);
    let signals: DeviceSignals | null = null;
    if (consented) {
      signals = input.signals ?? (await this.cachedSignals(input.deviceId));
      if (input.signals) await this.cacheSignals(input.deviceId, input.signals);
    }

    const device = await prisma.device.findUniqueOrThrow({ where: { id: input.deviceId } });
    let simChangedAt = device.simChangedAt;
    if (signals?.sim && signals.sim.fingerprint !== device.simHash) {
      // First report just records the SIM; any later difference is a SIM change.
      simChangedAt = device.simHash ? new Date() : device.simChangedAt;
      await prisma.device.update({ where: { id: device.id }, data: { simHash: signals.sim.fingerprint, simChangedAt } });
      if (device.simHash) {
        await this.deps.audit.append({ actorType: 'device', actorId: device.id, action: 'risk.sim_changed', subjectType: 'user', subjectId: input.userId });
      }
    }

    const facts = {
      deviceEnrolledAt: device.enrolledAt,
      simChangedAt,
      recentFailures: await this.credentials.recentFailures(input.userId),
      integrity: await this.integrityVerdict(device.id, signals),
      now: new Date(),
    };
    const ruleSet = await this.activeRuleSet();
    const result = evaluate(ruleSet, signals, facts, input.lang);

    if (input.persist !== false) {
      const id = crypto.randomUUID();
      const { integrity: _token, ...storable } = signals ?? ({} as Partial<DeviceSignals>);
      await prisma.riskSignal.create({
        data: {
          id,
          userId: input.userId,
          deviceId: input.deviceId,
          context: input.context,
          payloadEnc: this.deps.cipher.encryptJson({ signals: signals ? storable : null, integrity: facts.integrity }, ctxSignalPayload(id)),
          score: result.score,
          matchedRules: result.matched.map((m) => m.key),
          stepupRequestId: input.stepupRequestId ?? null,
        },
      });
    }
    return { ...result, signals, consented };
  }

  /** Re-word stored reasons in another language (guardian may use a different language). */
  async reasonsFor(keys: string[], lang: Lang): Promise<Array<{ key: string; weight: number; reason: string }>> {
    const set = await this.activeRuleSet();
    return keys.map((key) => {
      const rule = set.rules.find((r) => r.key === key);
      return { key, weight: rule?.weight ?? 0, reason: rule?.reasons[lang] ?? rule?.reasons.en ?? key };
    });
  }
}
