import type { GuardianLink, Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { randomDigits, randomToken, sha256B64url } from '../../lib/crypto.js';
import type { AuditInput } from '../audit/audit.service.js';
import type { Notifier } from '../push/notifier.js';
import type { UsersService } from '../users/users.service.js';

/** Links that count as a guardian today (a pending removal still guards until it takes effect). */
export const GUARDING_STATUSES = ['active', 'pending_removal'] as const;
/** Links that count towards the maximum of five. */
const LIVE_STATUSES = ['pending_activation', 'active', 'pending_removal'] as const;

const INVITE_CODE_DIGITS = 8;
const CODE_ATTEMPTS = 5;
const CODE_WINDOW = 15 * 60;

const NON_ASCII_DIGITS = /[௦-௯०-९]/;

/** Tamil (௦-௯) and Devanagari (०-९) digits to ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0x0be6))
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));
}

/** Reject codes typed in Tamil/Devanagari digits with an explicit, fixable error. */
export function assertAsciiCode(code: string): string {
  const trimmed = code.replace(/[\s-]/g, '');
  if (NON_ASCII_DIGITS.test(trimmed)) {
    throw new AppError('CODE_NON_ASCII_DIGITS', {}, { converted: toAsciiDigits(trimmed) });
  }
  return trimmed;
}

export class GuardiansService {
  constructor(
    private readonly deps: Deps,
    private readonly users: UsersService,
    private readonly notifier: Notifier,
  ) {}

  /** How long a removal waits. */
  private delayMs(): number {
    return this.deps.config.GUARDIAN_CHANGE_DELAY_SECONDS * 1000;
  }

  /** Until when the protected person can remove a newly started guardian instantly, or null. */
  undoUntil(link: Pick<GuardianLink, 'status' | 'activatedAt'>): Date | null {
    if (link.status !== 'active' || !link.activatedAt) return null;
    const until = new Date(link.activatedAt.getTime() + this.deps.config.GUARDIAN_UNDO_WINDOW_SECONDS * 1000);
    return until > new Date() ? until : null;
  }

  async guardianIds(userId: string): Promise<string[]> {
    const links = await this.deps.prisma.guardianLink.findMany({
      where: { userId, status: { in: [...GUARDING_STATUSES] } },
      select: { guardianId: true },
    });
    return links.map((l) => l.guardianId);
  }

  async isGuardianOf(guardianId: string, userId: string): Promise<boolean> {
    return (await this.deps.prisma.guardianLink.count({ where: { guardianId, userId, status: { in: [...GUARDING_STATUSES] } } })) > 0;
  }

  // ---------------------------------------------------------------- invites

  async createInvite(userId: string): Promise<{ token: string; code: string; url: string; expiresAt: string }> {
    const { prisma, config, limiter } = this.deps;
    await limiter.consume(`invite:create:${userId}`, 10, 3600);
    const live = await prisma.guardianLink.count({ where: { userId, status: { in: [...LIVE_STATUSES] } } });
    if (live >= config.MAX_GUARDIANS) throw new AppError('GUARDIAN_LIMIT_REACHED');
    const token = randomToken(24);
    let code = randomDigits(INVITE_CODE_DIGITS);
    const expiresAt = new Date(Date.now() + config.INVITE_TTL_SECONDS * 1000);
    await this.deps.audit.transaction(async (tx, log) => {
      // Retry on the (unlikely) collision of the short code's index.
      for (let attempt = 0; ; attempt++) {
        try {
          const invite = await tx.invite.create({
            data: { inviterId: userId, tokenHash: sha256B64url(token), codeHash: this.deps.blind.of('invite-code', code), expiresAt },
          });
          await log({ actorType: 'user', actorId: userId, action: 'guardian.invite_created', subjectType: 'invite', subjectId: invite.id });
          return;
        } catch (e) {
          if ((e as { code?: string }).code !== 'P2002' || attempt > 3) throw e;
          code = randomDigits(INVITE_CODE_DIGITS);
        }
      }
    });
    return { token, code, url: `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/invite/${token}`, expiresAt: expiresAt.toISOString() };
  }

  /** Find an invite by link token or short code. Codes are rate-limited per caller. */
  private async findInvite(callerKey: string, ref: { token?: string | undefined; code?: string | undefined }) {
    const { prisma, limiter, blind } = this.deps;
    let invite;
    if (ref.token) {
      invite = await prisma.invite.findUnique({ where: { tokenHash: sha256B64url(ref.token) } });
    } else if (ref.code) {
      const code = assertAsciiCode(ref.code);
      if (!/^\d{8}$/.test(code)) throw new AppError('CODE_INVALID');
      const key = `invite:code:${callerKey}`;
      await limiter.assertUnder(key, CODE_ATTEMPTS, CODE_WINDOW);
      invite = await prisma.invite.findUnique({ where: { codeHash: blind.of('invite-code', code) } });
      if (!invite) {
        await limiter.record(key, CODE_WINDOW);
        throw new AppError('CODE_INVALID');
      }
    } else {
      throw new AppError('INVALID_INPUT');
    }
    if (!invite || invite.revokedAt || invite.acceptedAt) throw new AppError('INVITE_INVALID');
    if (invite.expiresAt < new Date()) throw new AppError(ref.code ? 'CODE_EXPIRED' : 'INVITE_INVALID');
    return invite;
  }

  async previewInvite(callerId: string, ref: { token?: string; code?: string }) {
    const invite = await this.findInvite(callerId, ref);
    const inviter = await this.users.requireActiveUser(invite.inviterId).catch(() => {
      throw new AppError('INVITE_INVALID');
    });
    return { inviteExpiresAt: invite.expiresAt.toISOString(), inviter: { handle: inviter.handle, displayName: this.users.displayName(inviter) } };
  }

  async acceptInvite(guardianId: string, ref: { token?: string; code?: string }): Promise<GuardianLink> {
    const invite = await this.findInvite(guardianId, ref);
    if (invite.inviterId === guardianId) throw new AppError('CANNOT_GUARD_SELF');
    const { config } = this.deps;
    const link = await this.deps.audit.transaction(async (tx, log) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedById: guardianId },
      });
      if (claimed.count !== 1) throw new AppError('INVITE_INVALID');
      const live = await tx.guardianLink.findMany({ where: { userId: invite.inviterId, status: { in: [...LIVE_STATUSES] } } });
      if (live.some((l) => l.guardianId === guardianId)) throw new AppError('ALREADY_GUARDIAN');
      if (live.length >= config.MAX_GUARDIANS) throw new AppError('GUARDIAN_LIMIT_REACHED');
      // The person who invited them already chose them, so the guardian starts at once (unless a
      // delay is configured). The person is alerted and can undo it instantly for a day.
      const now = new Date();
      const delayMs = config.GUARDIAN_ACTIVATION_DELAY_SECONDS * 1000;
      const immediate = delayMs === 0;
      const created = await tx.guardianLink.create({
        data: {
          userId: invite.inviterId,
          guardianId,
          inviteId: invite.id,
          status: immediate ? 'active' : 'pending_activation',
          activatesAt: new Date(now.getTime() + delayMs),
          ...(immediate ? { activatedAt: now } : {}),
        },
      });
      await log({
        actorType: 'guardian',
        actorId: guardianId,
        action: 'guardian.invite_accepted',
        subjectType: 'guardian_link',
        subjectId: created.id,
        payload: { userId: invite.inviterId, activatesAt: created.activatesAt.toISOString() },
      });
      if (immediate) {
        await log({ actorType: 'system', action: 'guardian.activated', subjectType: 'guardian_link', subjectId: created.id, payload: { userId: invite.inviterId, guardianId } });
      }
      return created;
    });
    await this.alertChange(link, 'guardian_added');
    if (link.status === 'active') await this.tellOtherGuardians(link);
    return link;
  }

  /** The person's other guardians hear about a new guardian at once (a scammer adding themselves is caught). */
  private async tellOtherGuardians(link: GuardianLink): Promise<void> {
    const [person, guardian] = await Promise.all([
      this.deps.prisma.user.findUnique({ where: { id: link.userId } }),
      this.deps.prisma.user.findUnique({ where: { id: link.guardianId } }),
    ]);
    if (!person || !guardian) return;
    const personName = this.users.displayName(person);
    const guardianName = this.users.displayName(guardian);
    const others = await this.deps.prisma.guardianLink.findMany({
      where: { userId: link.userId, status: { in: [...GUARDING_STATUSES] }, guardianId: { not: link.guardianId } },
      select: { id: true, guardianId: true },
    });
    for (const o of others) {
      this.deps.realtime.toUser(o.guardianId, 'guarding.changed', { linkId: o.id });
      await this.notifier.push(o.guardianId, 'guardian_joined', () => ({ name: personName, guardian: guardianName }), { screen: 'guardian_person', linkId: o.id });
    }
  }

  // ---------------------------------------------------------------- changes (removals wait 24 h)

  async alertChange(link: GuardianLink, term: 'guardian_added' | 'guardian_removed'): Promise<void> {
    const guardian = await this.deps.prisma.user.findUnique({ where: { id: link.guardianId } });
    const name = guardian ? this.users.displayName(guardian) : '';
    if (term === 'guardian_added' && link.status === 'active') {
      await this.notifier.push(link.userId, 'guardian_started', () => ({ name }), { screen: 'guardians', linkId: link.id });
    } else {
      await this.notifier.push(link.userId, 'guardian_change', (lang) => ({ name, change: this.notifier.term(term, lang) }), {
        screen: 'guardians',
        linkId: link.id,
      });
    }
    this.deps.realtime.toUser(link.userId, 'guardians.changed', { linkId: link.id, status: link.status });
    this.deps.realtime.toUser(link.guardianId, 'guarding.changed', { linkId: link.id, status: link.status });
  }

  /**
   * Removal is a sensitive action; once approved it still waits 24 hours. Callers send the alert
   * (alertChange) after their transaction commits.
   */
  async scheduleRemoval(tx: Prisma.TransactionClient, log: (i: AuditInput) => Promise<unknown>, linkId: string, actorId: string): Promise<GuardianLink> {
    const removesAt = new Date(Date.now() + this.delayMs());
    const updated = await tx.guardianLink.updateMany({
      where: { id: linkId, status: 'active' },
      data: { status: 'pending_removal', removalRequestedAt: new Date(), removesAt },
    });
    if (updated.count !== 1) throw new AppError('NOT_FOUND');
    const link = await tx.guardianLink.findUniqueOrThrow({ where: { id: linkId } });
    await log({
      actorType: actorId === link.guardianId ? 'guardian' : 'user',
      actorId,
      action: 'guardian.removal_scheduled',
      subjectType: 'guardian_link',
      subjectId: linkId,
      payload: { userId: link.userId, guardianId: link.guardianId, removesAt: removesAt.toISOString() },
    });
    return link;
  }

  /**
   * The protected user may stop a change at once: a pending addition, a pending removal, or a
   * guardian who started less than a day ago ("I did not add them"). Cancelling a removal only ever
   * adds protection back; undoing a brand-new guardian removes someone they may not have chosen.
   */
  async cancelPendingChange(userId: string, linkId: string): Promise<void> {
    const undone = await this.deps.audit.transaction(async (tx, log) => {
      const link = await tx.guardianLink.findFirst({ where: { id: linkId, userId } });
      if (!link) throw new AppError('NOT_FOUND');
      if (link.status === 'pending_activation' || this.undoUntil(link) !== null) {
        const r = await tx.guardianLink.updateMany({ where: { id: linkId, status: link.status }, data: { status: 'cancelled', endedAt: new Date() } });
        if (r.count !== 1) throw new AppError('NOT_FOUND');
      } else if (link.status === 'pending_removal') {
        await tx.guardianLink.update({ where: { id: linkId }, data: { status: 'active', removalRequestedAt: null, removesAt: null } });
      } else {
        throw new AppError('NOT_FOUND');
      }
      await log({ actorType: 'user', actorId: userId, action: 'guardian.change_cancelled', subjectType: 'guardian_link', subjectId: linkId, payload: { from: link.status } });
      return link.status === 'active';
    });
    this.deps.realtime.toUser(userId, 'guardians.changed', { linkId });
    const link = await this.deps.prisma.guardianLink.findUnique({ where: { id: linkId } });
    if (!link) return;
    this.deps.realtime.toUser(link.guardianId, 'guarding.changed', { linkId, status: link.status });
    if (undone) {
      // The guardian always hears it, so a scammer on the phone cannot quietly drop a real guardian.
      const person = await this.deps.prisma.user.findUnique({ where: { id: userId } });
      const name = person ? this.users.displayName(person) : '';
      await this.notifier.push(link.guardianId, 'guardian_undone', () => ({ name }), { screen: 'family' });
    }
  }

  /** A guardian stepping down follows the same 24-hour delay so the user is warned in time. */
  async resign(guardianId: string, linkId: string): Promise<void> {
    const link = await this.deps.audit.transaction(async (tx, log) => {
      const existing = await tx.guardianLink.findFirst({ where: { id: linkId, guardianId, status: 'active' } });
      if (!existing) throw new AppError('NOT_FOUND');
      return this.scheduleRemoval(tx, log, linkId, guardianId);
    });
    await this.alertChange(link, 'guardian_removed');
  }

  /** Job: apply changes whose delay has passed. Conditional updates make it safe on many instances. */
  async applyDueChanges(): Promise<number> {
    const { prisma } = this.deps;
    const now = new Date();
    const due = await prisma.guardianLink.findMany({
      where: {
        OR: [
          { status: 'pending_activation', activatesAt: { lte: now } },
          { status: 'pending_removal', removesAt: { lte: now } },
        ],
      },
      take: 100,
    });
    let applied = 0;
    for (const link of due) {
      const next = link.status === 'pending_activation' ? 'active' : 'removed';
      const changed = await this.deps.audit.transaction(async (tx, log) => {
        const r = await tx.guardianLink.updateMany({
          where: { id: link.id, status: link.status },
          data: next === 'active' ? { status: 'active', activatedAt: now } : { status: 'removed', endedAt: now },
        });
        if (r.count !== 1) return false;
        await log({
          actorType: 'system',
          action: next === 'active' ? 'guardian.activated' : 'guardian.removed',
          subjectType: 'guardian_link',
          subjectId: link.id,
          payload: { userId: link.userId, guardianId: link.guardianId },
        });
        return true;
      });
      if (changed) {
        applied++;
        this.deps.realtime.toUser(link.userId, 'guardians.changed', { linkId: link.id, status: next });
        this.deps.realtime.toUser(link.guardianId, 'guarding.changed', { linkId: link.id, status: next });
      }
    }
    return applied;
  }
}
