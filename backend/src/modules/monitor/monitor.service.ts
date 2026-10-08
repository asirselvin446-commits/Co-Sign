import type { DevicePause, MonitorEvent as MonitorEventRow } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { Lang } from '../../generated/catalog.js';
import { AppError } from '../../lib/errors.js';
import { randomToken, sha256B64url } from '../../lib/crypto.js';
import type { Services } from '../../services.js';
import { AMOUNT_BUCKETS, assessMonitorEvent, monitorReasons, type AmountBucket, type MonitorAssessment, type MonitorEvent } from './monitor.engine.js';

export const MONITOR_CONSENT_PURPOSE = 'family_monitor';
export const ctxMonitorCall = (id: string) => `monitor.call:${id}`;

const PAUSE_TTL_MS = 30 * 60 * 1000;
const ALERT_THROTTLE_SECONDS = 10 * 60;
const BASELINE_DAYS = 60;

export interface IngestResult {
  clientId: string;
  score: number;
  severity: string;
  rules: string[];
  pause: boolean;
  pauseId: string | null;
}

/**
 * Family protection: stores what the protected phone observed, scores it, alerts guardians and
 * tracks safety pauses that a guardian can release remotely.
 */
export class MonitorService {
  constructor(
    private readonly deps: Deps,
    private readonly services: Services,
  ) {}

  // ---------------------------------------------------------------- device credentials

  /** Issue (or rotate) the narrow token the phone's background services use to upload events. */
  async issueToken(userId: string, deviceId: string): Promise<string> {
    if (!(await this.hasConsent(userId))) throw new AppError('CONSENT_REQUIRED');
    const token = randomToken(32);
    await this.deps.audit.transaction(async (tx, log) => {
      await tx.device.update({ where: { id: deviceId }, data: { monitorTokenHash: sha256B64url(token) } });
      await log({ actorType: 'user', actorId: userId, action: 'monitor.enabled', subjectType: 'device', subjectId: deviceId });
    });
    return token;
  }

  async revokeToken(userId: string, deviceId: string): Promise<void> {
    await this.deps.audit.transaction(async (tx, log) => {
      await tx.device.update({ where: { id: deviceId }, data: { monitorTokenHash: null } });
      await log({ actorType: 'user', actorId: userId, action: 'monitor.disabled', subjectType: 'device', subjectId: deviceId });
    });
  }

  /** Resolve a monitor token to its device. Revoked phones and deleted accounts are refused. */
  async deviceForToken(token: string): Promise<{ userId: string; deviceId: string }> {
    const device = await this.deps.prisma.device.findUnique({
      where: { monitorTokenHash: sha256B64url(token) },
      include: { user: { select: { status: true } } },
    });
    if (!device || device.revokedAt || device.user.status !== 'active') throw new AppError('SESSION_EXPIRED');
    return { userId: device.userId, deviceId: device.id };
  }

  async hasConsent(userId: string): Promise<boolean> {
    const latest = await this.deps.prisma.consent.findFirst({ where: { userId, purpose: MONITOR_CONSENT_PURPOSE }, orderBy: { createdAt: 'desc' } });
    return latest?.granted ?? false;
  }

  // ---------------------------------------------------------------- baseline

  /**
   * The largest debit range this person usually has: the highest range seen at least twice in the
   * last 60 days (one-off big payments do not raise the bar), else the largest seen, else none.
   */
  async usualMaxDebitBucket(userId: string): Promise<AmountBucket | null> {
    const rows = await this.deps.prisma.monitorEvent.groupBy({
      by: ['amountBucket'],
      where: { userId, kind: 'notification_debit', amountBucket: { not: null }, createdAt: { gt: new Date(Date.now() - BASELINE_DAYS * 86400_000) } },
      _count: { _all: true },
    });
    const counts = new Map(rows.map((r) => [r.amountBucket as AmountBucket, r._count._all]));
    const ordered = [...AMOUNT_BUCKETS].reverse();
    return ordered.find((b) => (counts.get(b) ?? 0) >= 2) ?? ordered.find((b) => counts.has(b)) ?? null;
  }

  // ---------------------------------------------------------------- ingest

  async ingest(userId: string, deviceId: string, events: MonitorEvent[]): Promise<IngestResult[]> {
    if (!(await this.hasConsent(userId))) throw new AppError('CONSENT_REQUIRED');
    const results: IngestResult[] = [];
    // Oldest first, so the baseline reflects earlier debits in the same batch.
    for (const e of [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const existing = await this.deps.prisma.monitorEvent.findUnique({ where: { deviceId_clientId: { deviceId, clientId: e.clientId } }, include: { pauses: true } });
      if (existing) {
        results.push(this.result(existing, existing.pauses[0] ?? null));
        continue;
      }
      const assessment = assessMonitorEvent(e, { usualMaxDebitBucket: await this.usualMaxDebitBucket(userId) });
      const { row, pause } = await this.store(userId, deviceId, e, assessment);
      results.push(this.result(row, pause));
      if (assessment.severity !== 'info') await this.alertGuardians(userId, row, pause);
    }
    return results;
  }

  private result(row: MonitorEventRow, pause: DevicePause | null): IngestResult {
    return { clientId: row.clientId, score: row.score, severity: row.severity, rules: row.rules, pause: row.paused, pauseId: pause?.id ?? null };
  }

  private async store(userId: string, deviceId: string, e: MonitorEvent, a: MonitorAssessment) {
    // A pause is only recorded when the phone actually showed one (it decides offline, instantly).
    const showPause = e.paused && a.pause;
    return this.deps.audit.transaction(async (tx, log) => {
      const id = crypto.randomUUID();
      const row = await tx.monitorEvent.create({
        data: {
          id,
          userId,
          deviceId,
          clientId: e.clientId,
          kind: e.kind,
          appCategory: e.app?.category ?? null,
          appPackage: e.app?.package ?? null,
          amountBucket: e.amountBucket,
          callEnc: e.call ? this.deps.cipher.encryptJson(e.call, ctxMonitorCall(id)) : null,
          score: a.score,
          severity: a.severity,
          rules: a.rules,
          paused: showPause,
          occurredAt: new Date(e.occurredAt),
        },
      });
      let pause: DevicePause | null = null;
      if (showPause) {
        await tx.devicePause.updateMany({ where: { deviceId, status: 'active' }, data: { status: 'expired', endedAt: new Date(), endedBy: 'superseded' } });
        pause = await tx.devicePause.create({
          data: { userId, deviceId, eventId: row.id, status: 'active', rules: a.rules, expiresAt: new Date(Date.now() + PAUSE_TTL_MS) },
        });
      }
      if (a.severity !== 'info') {
        await log({
          actorType: 'device',
          actorId: deviceId,
          action: showPause ? 'monitor.pause_started' : 'monitor.alert',
          subjectType: 'user',
          subjectId: userId,
          payload: { eventId: row.id, kind: e.kind, severity: a.severity, score: a.score, rules: a.rules, appCategory: e.app?.category ?? null },
        });
      }
      return { row, pause };
    });
  }

  private async alertGuardians(userId: string, row: MonitorEventRow, pause: DevicePause | null): Promise<void> {
    const { guardians, notifier, users } = this.services;
    const owner = await this.deps.prisma.user.findUnique({ where: { id: userId } });
    if (!owner) return;
    const name = users.displayName(owner);
    const ids = await guardians.guardianIds(userId);
    const top = row.rules[0] ?? '';
    // Throttle pushes for the same situation; the alert list and live feed still get every event.
    const throttleKey = `monalert:${userId}:${top}`;
    const sendPush = pause !== null || (await this.deps.redis.set(throttleKey, '1', 'EX', ALERT_THROTTLE_SECONDS, 'NX')) === 'OK';
    for (const gid of ids) {
      this.deps.realtime.toUser(gid, 'guardian.alert', { alertId: row.id, severity: row.severity, pauseId: pause?.id ?? null });
      if (!sendPush) continue;
      await notifier.push(
        gid,
        pause ? 'monitor_paused' : 'monitor_alert',
        (lang) => ({ name, what: monitorReasons([top], lang)[0]?.reason.replace(/\.$/, '') ?? '' }),
        { screen: 'guardian_alert', alertId: row.id, ...(pause ? { pauseId: pause.id } : {}) },
      );
    }
  }

  // ---------------------------------------------------------------- pauses

  async pause(pauseId: string, deviceId: string): Promise<DevicePause> {
    const p = await this.deps.prisma.devicePause.findFirst({ where: { id: pauseId, deviceId } });
    if (!p) throw new AppError('NOT_FOUND');
    if (p.status === 'active' && p.expiresAt < new Date()) {
      return this.deps.prisma.devicePause.update({ where: { id: p.id }, data: { status: 'expired', endedAt: new Date(), endedBy: 'timeout' } });
    }
    return p;
  }

  /** The person chose to continue after the countdown. Never a permanent lockout. */
  async dismiss(pauseId: string, userId: string, deviceId: string): Promise<void> {
    const changed = await this.end(pauseId, { deviceId }, 'dismissed', 'user', { actorType: 'device', actorId: deviceId });
    if (changed) {
      for (const gid of await this.services.guardians.guardianIds(userId)) this.deps.realtime.toUser(gid, 'guardian.alert', { pauseId, status: 'dismissed' });
    }
  }

  async release(pauseId: string, guardianId: string): Promise<void> {
    const p = await this.deps.prisma.devicePause.findUnique({ where: { id: pauseId } });
    if (!p || !(await this.services.guardians.isGuardianOf(guardianId, p.userId))) throw new AppError('NOT_FOUND');
    const changed = await this.end(pauseId, { userId: p.userId }, 'released', guardianId, { actorType: 'guardian', actorId: guardianId });
    if (!changed) throw new AppError('REQUEST_ALREADY_DECIDED');
    this.deps.realtime.toDevice(p.deviceId, 'monitor.pause', { pauseId, status: 'released' });
  }

  private async end(
    pauseId: string,
    owner: { deviceId?: string; userId?: string },
    status: 'released' | 'dismissed',
    endedBy: string,
    actor: { actorType: 'device' | 'guardian'; actorId: string },
  ): Promise<boolean> {
    return this.deps.audit.transaction(async (tx, log) => {
      const r = await tx.devicePause.updateMany({ where: { id: pauseId, status: 'active', ...owner }, data: { status, endedAt: new Date(), endedBy } });
      if (r.count !== 1) return false;
      await log({ ...actor, action: status === 'released' ? 'monitor.pause_released' : 'monitor.pause_dismissed', subjectType: 'pause', subjectId: pauseId });
      return true;
    });
  }

  // ---------------------------------------------------------------- guardian view

  async alertsFor(guardianId: string, lang: Lang, limit = 50) {
    const links = await this.deps.prisma.guardianLink.findMany({
      where: { guardianId, status: { in: ['active', 'pending_removal'] } },
      include: { user: true },
    });
    const people = new Map(links.map((l) => [l.userId, l.user]));
    if (people.size === 0) return [];
    const rows = await this.deps.prisma.monitorEvent.findMany({
      where: { userId: { in: [...people.keys()] }, severity: { in: ['warn', 'critical'] }, createdAt: { gt: new Date(Date.now() - 7 * 86400_000) } },
      include: { pauses: true },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => {
      const person = people.get(r.userId)!;
      const pause = r.pauses[0] ?? null;
      return {
        id: r.id,
        person: { displayName: this.services.users.displayName(person), handle: person.handle },
        kind: r.kind,
        app: r.appCategory ? { category: r.appCategory, package: r.appPackage } : null,
        amountBucket: r.amountBucket,
        severity: r.severity,
        score: r.score,
        reasons: monitorReasons(r.rules, lang),
        occurredAt: r.occurredAt.toISOString(),
        acknowledged: r.acknowledgedAt !== null,
        pause: pause ? { id: pause.id, status: pause.status === 'active' && pause.expiresAt < new Date() ? 'expired' : pause.status } : null,
      };
    });
  }

  async acknowledge(alertId: string, guardianId: string): Promise<void> {
    const row = await this.deps.prisma.monitorEvent.findUnique({ where: { id: alertId } });
    if (!row || !(await this.services.guardians.isGuardianOf(guardianId, row.userId))) throw new AppError('NOT_FOUND');
    await this.deps.prisma.monitorEvent.update({ where: { id: alertId }, data: { acknowledgedAt: new Date(), acknowledgedBy: guardianId } });
  }

  // ---------------------------------------------------------------- retention

  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.deps.config.SIGNAL_RETENTION_DAYS * 86400_000);
    const { count } = await this.deps.prisma.monitorEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await this.deps.prisma.devicePause.updateMany({ where: { status: 'active', expiresAt: { lt: new Date() } }, data: { status: 'expired', endedAt: new Date(), endedBy: 'timeout' } });
    return count;
  }
}
