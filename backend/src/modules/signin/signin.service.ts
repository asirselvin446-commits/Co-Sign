import type { SigninRequest } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { TERMS, type Lang } from '../../generated/catalog.js';
import { AppError } from '../../lib/errors.js';
import { randomToken } from '../../lib/crypto.js';
import type { Services } from '../../services.js';
import { analyzeLink, type LinkAnalysis } from '../links/link.engine.js';
import { riskyCall, type MonitorEvent } from '../monitor/monitor.engine.js';

/** How long the guardian has to answer. */
export const SIGNIN_TTL_MS = 5 * 60 * 1000;
const OPEN = 'pending' as const;

export interface SigninTarget {
  package: string | null;
  webDomain: string | null;
  appLabel: string;
}

export interface CreateSignin {
  userId: string;
  deviceId: string;
  mode: 'fill' | 'show';
  target: SigninTarget;
  /** The asking phone's one-time public key (SPKI, base64). Only it can read the answer. */
  publicKey: string;
  call: MonitorEvent['call'];
}

/**
 * Guardian-assisted sign-in. The person's phone asks; a guardian answers with the password sealed
 * to the phone's one-time key. The server only relays: it never sees a password, delivers the
 * sealed answer once, and wipes it.
 */
export class SigninService {
  constructor(
    private readonly deps: Deps,
    private readonly services: Services,
  ) {}

  private guardianLinks(userId: string) {
    return this.deps.prisma.guardianLink.findMany({ where: { userId, status: { in: ['active', 'pending_removal'] } }, select: { id: true, guardianId: true } });
  }

  async create(input: CreateSignin): Promise<SigninRequest> {
    const { prisma, audit, realtime } = this.deps;
    const { notifier, users, monitor } = this.services;
    const host = input.target.webDomain?.trim().toLowerCase() || null;
    const link: LinkAnalysis | null = host ? analyzeLink(host) : null;
    if (link?.verdict === 'lookalike') {
      // Never ask a guardian to type a password into a fake site. Alert them instead.
      await monitor.ingest(input.userId, input.deviceId, [
        {
          clientId: `signin${randomToken(9)}`,
          kind: 'phishing_page',
          occurredAt: new Date().toISOString(),
          app: input.target.package ? { package: input.target.package, category: 'browser' } : null,
          amountBucket: null,
          call: input.call,
          localHour: new Date().getHours(),
          paused: false,
          sinceOtpSec: null,
          attempts: null,
          installer: null,
          grant: null,
          scamPhrases: [],
          linkFlags: link.flags,
          linkVerdict: 'lookalike',
          linkDomain: link.registrableDomain,
          sinceScamLinkSec: null,
        },
      ]);
      await audit.append({ actorType: 'device', actorId: input.deviceId, action: 'signin.blocked_fake_site', subjectType: 'user', subjectId: input.userId, payload: { domain: link.registrableDomain } });
      throw new AppError('SIGNIN_BLOCKED_FAKE_SITE');
    }
    const onRiskyCall = riskyCall(input.call);
    if (input.mode === 'show' && onRiskyCall) throw new AppError('SIGNIN_SHOW_REFUSED_ON_CALL');
    const links = await this.guardianLinks(input.userId);
    if (links.length === 0) throw new AppError('SIGNIN_NO_GUARDIAN');

    const recentAlert = await prisma.monitorEvent.count({ where: { userId: input.userId, severity: 'critical', createdAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
    const reasons: string[] = [];
    if (onRiskyCall) reasons.push('signin_risky_call');
    if (recentAlert > 0) reasons.push('signin_recent_alert');
    if (link?.verdict === 'suspicious') reasons.push('signin_suspicious_site');
    if (link?.verdict === 'unknown') reasons.push('signin_unknown_site');

    const request = await audit.transaction(async (tx, log) => {
      const created = await tx.signinRequest.create({
        data: {
          userId: input.userId,
          deviceId: input.deviceId,
          mode: input.mode,
          targetPackage: input.target.package,
          targetHost: link?.host ?? null,
          registrableDomain: link?.registrableDomain ?? null,
          appLabel: input.target.appLabel,
          linkVerdict: link?.verdict ?? 'app',
          brand: link?.brand ?? null,
          publicKey: input.publicKey,
          riskReasons: reasons,
          expiresAt: new Date(Date.now() + SIGNIN_TTL_MS),
        },
      });
      await log({
        actorType: 'device',
        actorId: input.deviceId,
        action: 'signin.created',
        subjectType: 'signin',
        subjectId: created.id,
        payload: { userId: input.userId, mode: input.mode, package: input.target.package, domain: link?.registrableDomain ?? null, verdict: link?.verdict ?? 'app', reasons },
      });
      return created;
    });

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
    const name = users.displayName(owner);
    const app = request.registrableDomain ?? request.appLabel;
    for (const l of links) {
      realtime.toUser(l.guardianId, 'guardian.signin', { signinId: request.id });
      await notifier.push(
        l.guardianId,
        'signin_request',
        (lang) => ({ name, app, what: reasons.length ? `${TERMS[reasons[0] as keyof typeof TERMS][lang]} ` : '' }),
        { screen: 'guardian_signin', signinId: request.id, linkId: l.id },
      );
    }
    return request;
  }

  /** The asking phone polls. A filled answer is handed over exactly once, then wiped. */
  async poll(id: string, deviceId: string): Promise<{ request: SigninRequest; ciphertext: string | null; guardianName: string | null }> {
    const { prisma, audit } = this.deps;
    let r = await prisma.signinRequest.findFirst({ where: { id, deviceId } });
    if (!r) throw new AppError('NOT_FOUND');
    if (r.status === OPEN && r.expiresAt < new Date()) r = await this.expire(r);
    const guardianName = r.answeredBy ? await this.nameOf(r.answeredBy) : null;
    if (r.status !== 'filled') return { request: r, ciphertext: null, guardianName };
    const ciphertext = r.ciphertext;
    const delivered = await audit.transaction(async (tx, log) => {
      const done = await tx.signinRequest.updateMany({ where: { id, status: 'filled' }, data: { status: 'delivered', ciphertext: null, deliveredAt: new Date() } });
      if (done.count !== 1) return false;
      await log({ actorType: 'device', actorId: deviceId, action: 'signin.delivered', subjectType: 'signin', subjectId: id });
      return true;
    });
    const fresh = await prisma.signinRequest.findUniqueOrThrow({ where: { id } });
    return { request: fresh, ciphertext: delivered ? ciphertext : null, guardianName };
  }

  async cancel(id: string, deviceId: string): Promise<void> {
    const r = await this.deps.prisma.signinRequest.findFirst({ where: { id, deviceId } });
    if (!r) throw new AppError('NOT_FOUND');
    const changed = await this.deps.audit.transaction(async (tx, log) => {
      const u = await tx.signinRequest.updateMany({ where: { id, status: OPEN }, data: { status: 'cancelled' } });
      if (u.count === 1) await log({ actorType: 'device', actorId: deviceId, action: 'signin.cancelled', subjectType: 'signin', subjectId: id });
      return u.count === 1;
    });
    if (changed) await this.closeForGuardians(r);
  }

  /** The person's own recent requests (no secrets). */
  async mine(userId: string) {
    const rows = await this.deps.prisma.signinRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return Promise.all(rows.map(async (r) => ({ ...this.publicView(r), guardianName: r.answeredBy ? await this.nameOf(r.answeredBy) : null })));
  }

  // ---------------------------------------------------------------- guardian

  private async guardedRequest(id: string, guardianId: string): Promise<SigninRequest> {
    const r = await this.deps.prisma.signinRequest.findUnique({ where: { id } });
    if (!r || !(await this.services.guardians.isGuardianOf(guardianId, r.userId))) throw new AppError('NOT_FOUND');
    return r;
  }

  async guardianView(id: string, guardianId: string, lang: Lang) {
    let r = await this.guardedRequest(id, guardianId);
    if (r.status === OPEN && r.expiresAt < new Date()) r = await this.expire(r);
    return this.guardianShape(r, guardianId, lang);
  }

  /** Open requests from the people I guard. */
  async openFor(guardianId: string, lang: Lang) {
    const links = await this.deps.prisma.guardianLink.findMany({ where: { guardianId, status: { in: ['active', 'pending_removal'] } }, select: { userId: true } });
    const rows = await this.deps.prisma.signinRequest.findMany({
      where: { userId: { in: links.map((l) => l.userId) }, status: OPEN, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return Promise.all(rows.map((r) => this.guardianShape(r, guardianId, lang)));
  }

  private async guardianShape(r: SigninRequest, guardianId: string, lang: Lang) {
    const [owner, link] = await Promise.all([
      this.deps.prisma.user.findUniqueOrThrow({ where: { id: r.userId } }),
      this.deps.prisma.guardianLink.findFirst({ where: { userId: r.userId, guardianId, status: { in: ['active', 'pending_removal'] } }, select: { id: true } }),
    ]);
    return {
      ...this.publicView(r),
      person: { displayName: this.services.users.displayName(owner), handle: owner.handle, linkId: link?.id ?? null },
      publicKey: r.status === OPEN ? r.publicKey : null,
      reasons: r.riskReasons.map((k) => ({ key: k, reason: TERMS[k as keyof typeof TERMS]?.[lang] ?? k })),
      answeredByMe: r.answeredBy === guardianId,
    };
  }

  private publicView(r: SigninRequest) {
    return {
      id: r.id,
      mode: r.mode,
      status: r.status === OPEN && r.expiresAt < new Date() ? ('expired' as const) : r.status,
      target: { package: r.targetPackage, host: r.targetHost, domain: r.registrableDomain, appLabel: r.appLabel, verdict: r.linkVerdict, brand: r.brand },
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      answeredAt: r.answeredAt?.toISOString() ?? null,
    };
  }

  /**
   * The guardian answers from their signed-in phone (the app confirms with that phone's own screen
   * lock before sealing). "deny" needs nothing more: saying no only ever protects the person.
   */
  async answer(id: string, guardianId: string, decision: 'fill' | 'deny', ciphertext: string | null): Promise<SigninRequest> {
    const r = await this.guardedRequest(id, guardianId);
    this.assertOpen(r);
    const fill = decision === 'fill';
    if (fill && !ciphertext) throw new AppError('INVALID_INPUT', {}, { fields: ['ciphertext'] });
    const updated = await this.deps.audit.transaction(async (tx, log) => {
      const u = await tx.signinRequest.updateMany({
        where: { id, status: OPEN, expiresAt: { gt: new Date() } },
        data: { status: fill ? 'filled' : 'denied', answeredBy: guardianId, answeredAt: new Date(), ciphertext: fill ? ciphertext : null },
      });
      if (u.count !== 1) throw new AppError('REQUEST_ALREADY_DECIDED');
      await log({ actorType: 'guardian', actorId: guardianId, action: fill ? 'signin.answered' : 'signin.denied', subjectType: 'signin', subjectId: id, payload: { userId: r.userId, mode: r.mode } });
      return tx.signinRequest.findUniqueOrThrow({ where: { id } });
    });
    this.deps.realtime.toDevice(r.deviceId, 'signin.updated', { signinId: id, status: updated.status });
    await this.closeForGuardians(updated, guardianId);
    return updated;
  }

  private assertOpen(r: SigninRequest): void {
    if (r.status !== OPEN) throw new AppError('REQUEST_ALREADY_DECIDED');
    if (r.expiresAt < new Date()) throw new AppError('SIGNIN_EXPIRED');
  }

  private async expire(r: SigninRequest): Promise<SigninRequest> {
    await this.deps.audit.transaction(async (tx, log) => {
      const u = await tx.signinRequest.updateMany({ where: { id: r.id, status: OPEN }, data: { status: 'expired', ciphertext: null } });
      if (u.count === 1) await log({ actorType: 'system', action: 'signin.expired', subjectType: 'signin', subjectId: r.id });
    });
    return this.deps.prisma.signinRequest.findUniqueOrThrow({ where: { id: r.id } });
  }

  private async closeForGuardians(r: SigninRequest, exceptGuardianId?: string): Promise<void> {
    for (const l of await this.guardianLinks(r.userId)) {
      if (l.guardianId !== exceptGuardianId) this.deps.realtime.toUser(l.guardianId, 'guardian.signin.closed', { signinId: r.id });
    }
  }

  private async nameOf(userId: string): Promise<string | null> {
    const u = await this.deps.prisma.user.findUnique({ where: { id: userId } });
    return u ? this.services.users.displayName(u) : null;
  }

  /** Job: expire unanswered requests and wipe any ciphertext that was never collected. */
  async runTimers(): Promise<number> {
    const { prisma } = this.deps;
    const due = await prisma.signinRequest.findMany({ where: { status: OPEN, expiresAt: { lt: new Date() } }, take: 100 });
    for (const r of due) await this.expire(r);
    // A filled answer the phone never collected is useless after a few minutes: wipe it.
    await prisma.signinRequest.updateMany({
      where: { status: 'filled', answeredAt: { lt: new Date(Date.now() - SIGNIN_TTL_MS) } },
      data: { status: 'expired', ciphertext: null },
    });
    return due.length;
  }
}
