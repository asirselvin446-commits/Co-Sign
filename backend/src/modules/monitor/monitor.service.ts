import type { DevicePause, MonitorEvent as MonitorEventRow, Prisma } from '@prisma/client';
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
const LOCK_COMMAND_TTL_SECONDS = 5 * 60;
const lockKey = (deviceId: string) => `moncmd:lock:${deviceId}`;
export const GUARDIAN_PAUSE_RULE = 'guardian_paused';

/** The worrying website behind an alert, if the phone reported one (domain only). */
function linkOf(detail: Prisma.JsonValue | null): { domain: string; verdict: string } | null {
  const d = detail as { linkDomain?: string; linkVerdict?: string } | null;
  return d?.linkDomain && d.linkVerdict ? { domain: d.linkDomain, verdict: d.linkVerdict } : null;
}

/** The extra, non-sensitive facts some event kinds carry. Null when there are none. */
function eventDetail(e: MonitorEvent): Prisma.InputJsonObject | null {
  const d: Record<string, string | number | string[]> = {};
  if (e.sinceOtpSec !== null) d.sinceOtpSec = e.sinceOtpSec;
  if (e.attempts !== null) d.attempts = e.attempts;
  if (e.installer !== null) d.installer = e.installer;
  if (e.grant !== null) d.grant = e.grant;
  if (e.scamPhrases.length) d.scamPhrases = e.scamPhrases;
  if (e.linkFlags.length) d.linkFlags = e.linkFlags;
  if (e.linkVerdict !== null) d.linkVerdict = e.linkVerdict;
  if (e.linkDomain !== null && (e.linkVerdict === 'lookalike' || e.linkVerdict === 'suspicious')) d.linkDomain = e.linkDomain;
  if (e.sinceScamLinkSec !== null) d.sinceScamLinkSec = e.sinceScamLinkSec;
  return Object.keys(d).length > 0 ? d : null;
}

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
    const detail = eventDetail(e);
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
          ...(detail ? { detail } : {}),
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
    const { notifier } = this.services;
    const name = await this.personName(userId);
    if (name === null) return;
    const top = row.rules[0] ?? '';
    // Throttle pushes for the same situation; the alert list and live feed still get every event.
    const throttleKey = `monalert:${userId}:${top}`;
    const sendPush = pause !== null || (await this.deps.redis.set(throttleKey, '1', 'EX', ALERT_THROTTLE_SECONDS, 'NX')) === 'OK';
    for (const link of await this.guardianLinks(userId)) {
      this.deps.realtime.toUser(link.guardianId, 'guardian.alert', { alertId: row.id, severity: row.severity, pauseId: pause?.id ?? null });
      if (!sendPush) continue;
      await notifier.push(
        link.guardianId,
        pause ? 'monitor_paused' : 'monitor_alert',
        (lang) => ({ name, what: this.what(row.rules, lang) }),
        { screen: 'guardian_alert', alertId: row.id, linkId: link.id, ...(pause ? { pauseId: pause.id } : {}) },
      );
    }
  }

  private async personName(userId: string): Promise<string | null> {
    const owner = await this.deps.prisma.user.findUnique({ where: { id: userId } });
    return owner ? this.services.users.displayName(owner) : null;
  }

  /** The guardian links of the people guarding this person (one per guardian). */
  private guardianLinks(userId: string) {
    return this.deps.prisma.guardianLink.findMany({ where: { userId, status: { in: ['active', 'pending_removal'] } }, select: { id: true, guardianId: true } });
  }

  /** The main reason, for a notification body, without its final full stop. */
  private what(rules: string[], lang: Lang): string {
    return monitorReasons([rules[0] ?? ''], lang)[0]?.reason.replace(/\.$/, '') ?? '';
  }

  /** A guardian's link to a person, if it lets them act (active, or active until a pending removal). */
  private async actingLink(guardianId: string, linkId: string) {
    const link = await this.deps.prisma.guardianLink.findFirst({ where: { id: linkId, guardianId, status: { in: ['active', 'pending_removal'] } } });
    if (!link) throw new AppError('NOT_FOUND');
    return link;
  }

  /** Phones of this person with family protection switched on. */
  private protectedDevices(userId: string) {
    return this.deps.prisma.device.findMany({ where: { userId, revokedAt: null, monitorTokenHash: { not: null } }, select: { id: true, lastSeenAt: true } });
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

  // ---------------------------------------------------------------- guardian controls

  /**
   * The guardian pauses the person's protected phone(s) now, e.g. after a worrying alert or a call
   * for help. The person still sees why, can call the guardian, and can continue after the countdown.
   */
  async guardianPause(guardianId: string, linkId: string): Promise<{ pauseIds: string[] }> {
    const link = await this.actingLink(guardianId, linkId);
    const devices = await this.protectedDevices(link.userId);
    if (devices.length === 0) throw new AppError('PROTECTION_OFF');
    const pauses = await this.deps.audit.transaction(async (tx, log) => {
      const created: DevicePause[] = [];
      for (const d of devices) {
        await tx.devicePause.updateMany({ where: { deviceId: d.id, status: 'active' }, data: { status: 'expired', endedAt: new Date(), endedBy: 'superseded' } });
        created.push(
          await tx.devicePause.create({
            data: { userId: link.userId, deviceId: d.id, eventId: null, status: 'active', rules: [GUARDIAN_PAUSE_RULE], expiresAt: new Date(Date.now() + PAUSE_TTL_MS) },
          }),
        );
      }
      await log({ actorType: 'guardian', actorId: guardianId, action: 'monitor.guardian_paused', subjectType: 'user', subjectId: link.userId, payload: { devices: devices.length } });
      return created;
    });
    for (const p of pauses) this.deps.realtime.toDevice(p.deviceId, 'monitor.pause', { pauseId: p.id, status: 'active' });
    return { pauseIds: pauses.map((p) => p.id) };
  }

  /** The guardian locks the person's protected phone(s); they unlock it with their own screen lock. */
  async guardianLock(guardianId: string, linkId: string): Promise<{ devices: number }> {
    const link = await this.actingLink(guardianId, linkId);
    const devices = await this.protectedDevices(link.userId);
    if (devices.length === 0) throw new AppError('PROTECTION_OFF');
    for (const d of devices) await this.deps.redis.set(lockKey(d.id), guardianId, 'EX', LOCK_COMMAND_TTL_SECONDS);
    await this.deps.audit.append({ actorType: 'guardian', actorId: guardianId, action: 'monitor.guardian_locked', subjectType: 'user', subjectId: link.userId, payload: { devices: devices.length } });
    for (const d of devices) this.deps.realtime.toDevice(d.id, 'monitor.command', { lock: true });
    return { devices: devices.length };
  }

  /**
   * What the protected phone should do now: show the active pause (from the rules or the guardian)
   * and lock the screen once if a guardian asked. Polled by the phone's background service.
   */
  async commands(deviceId: string): Promise<{ pause: { id: string; rules: string[]; byGuardian: boolean; expiresAt: string } | null; lock: boolean }> {
    const { prisma, redis } = this.deps;
    // "Last seen" for the guardian's status view, written at most every five minutes.
    if ((await redis.set(`monseen:${deviceId}`, '1', 'EX', 300, 'NX')) === 'OK') {
      await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
    }
    const [pause, lock] = await Promise.all([
      prisma.devicePause.findFirst({ where: { deviceId, status: 'active', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
      redis.getdel(lockKey(deviceId)),
    ]);
    return {
      pause: pause ? { id: pause.id, rules: pause.rules, byGuardian: pause.eventId === null, expiresAt: pause.expiresAt.toISOString() } : null,
      lock: lock !== null,
    };
  }

  /** From the pause screen: "Ask my guardian to let me continue". */
  async askRelease(pauseId: string, userId: string, deviceId: string): Promise<void> {
    const p = await this.deps.prisma.devicePause.findFirst({ where: { id: pauseId, deviceId, status: 'active', expiresAt: { gt: new Date() } } });
    if (!p) throw new AppError('NOT_FOUND');
    // One ask per pause every two minutes, so a worried tap-tap-tap does not flood the guardian.
    if ((await this.deps.redis.set(`monask:${pauseId}`, '1', 'EX', 120, 'NX')) !== 'OK') return;
    const name = await this.personName(userId);
    if (name === null) return;
    await this.deps.audit.append({ actorType: 'device', actorId: deviceId, action: 'monitor.release_asked', subjectType: 'pause', subjectId: pauseId });
    for (const link of await this.guardianLinks(userId)) {
      this.deps.realtime.toUser(link.guardianId, 'guardian.alert', { pauseId, status: 'asked' });
      await this.services.notifier.push(link.guardianId, 'monitor_release_ask', (lang) => ({ name, what: this.what(p.rules, lang) }), {
        screen: 'guardian_pause',
        pauseId,
        linkId: link.id,
      });
    }
  }

  /** "I need help": tells every guardian at once. */
  async help(userId: string, deviceId: string): Promise<void> {
    if ((await this.deps.redis.set(`monhelp:${userId}`, '1', 'EX', 120, 'NX')) !== 'OK') return;
    const name = await this.personName(userId);
    if (name === null) return;
    await this.deps.audit.append({ actorType: 'user', actorId: userId, action: 'monitor.help_requested', subjectType: 'user', subjectId: userId, payload: { deviceId } });
    for (const link of await this.guardianLinks(userId)) {
      this.deps.realtime.toUser(link.guardianId, 'guardian.help', { linkId: link.id });
      await this.services.notifier.push(link.guardianId, 'monitor_help', () => ({ name }), { screen: 'guardian_person', linkId: link.id });
    }
  }

  /** A pause as the guardian sees it (from the "asking to continue" notification). */
  async pauseForGuardian(pauseId: string, guardianId: string, lang: Lang) {
    const p = await this.deps.prisma.devicePause.findUnique({ where: { id: pauseId }, include: { user: true } });
    if (!p || !(await this.services.guardians.isGuardianOf(guardianId, p.userId))) throw new AppError('NOT_FOUND');
    const status = p.status === 'active' && p.expiresAt < new Date() ? 'expired' : p.status;
    return {
      id: p.id,
      status,
      byGuardian: p.eventId === null,
      person: { displayName: this.services.users.displayName(p.user), handle: p.user.handle },
      reasons: monitorReasons(p.rules, lang),
      createdAt: p.createdAt.toISOString(),
      expiresAt: p.expiresAt.toISOString(),
    };
  }

  /** Protection status per guarded person, for the guardian's Family screen. */
  async protectionFor(userIds: string[]) {
    const now = new Date();
    const [devices, pauses, alerts] = await Promise.all([
      this.deps.prisma.device.findMany({ where: { userId: { in: userIds }, revokedAt: null, monitorTokenHash: { not: null } }, select: { userId: true, lastSeenAt: true } }),
      this.deps.prisma.devicePause.findMany({ where: { userId: { in: userIds }, status: 'active', expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } }),
      this.deps.prisma.monitorEvent.findMany({
        where: { userId: { in: userIds }, severity: { in: ['warn', 'critical'] }, createdAt: { gt: new Date(now.getTime() - 7 * 86400_000) } },
        orderBy: { occurredAt: 'desc' },
        distinct: ['userId'],
        select: { userId: true, id: true, severity: true, occurredAt: true },
      }),
    ]);
    return new Map(
      userIds.map((id) => {
        const mine = devices.filter((d) => d.userId === id);
        const pause = pauses.find((p) => p.userId === id) ?? null;
        const last = alerts.find((a) => a.userId === id) ?? null;
        const seen = mine.map((d) => d.lastSeenAt.getTime()).sort((a, b) => b - a)[0];
        return [
          id,
          {
            on: mine.length > 0,
            lastSeenAt: seen ? new Date(seen).toISOString() : null,
            activePause: pause ? { id: pause.id, byGuardian: pause.eventId === null, expiresAt: pause.expiresAt.toISOString() } : null,
            lastAlert: last ? { id: last.id, severity: last.severity, occurredAt: last.occurredAt.toISOString() } : null,
          },
        ] as const;
      }),
    );
  }

  /** The protected person's own recent warnings, so nothing is hidden from them. */
  async mine(userId: string, lang: Lang, limit = 20) {
    const rows = await this.deps.prisma.monitorEvent.findMany({
      where: { userId, severity: { in: ['warn', 'critical'] }, createdAt: { gt: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, reasons: monitorReasons(r.rules, lang), occurredAt: r.occurredAt.toISOString(), paused: r.paused }));
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
    const people = new Map(links.map((l) => [l.userId, { ...l.user, linkId: l.id }]));
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
        person: { displayName: this.services.users.displayName(person), handle: person.handle, linkId: person.linkId },
        kind: r.kind,
        app: r.appCategory ? { category: r.appCategory, package: r.appPackage } : null,
        amountBucket: r.amountBucket,
        link: linkOf(r.detail),
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
