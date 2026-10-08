import type { Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { AuditInput } from '../audit/audit.service.js';
import { ctxTransferMemo } from '../ledger/ledger.service.js';
import { ctxSignalPayload } from '../risk/risk.service.js';
import { ctxDeviceName, ctxUserEmail, ctxUserName, ctxUserPhone } from '../users/users.service.js';
import type { DevicesService } from '../devices/devices.service.js';

/**
 * Data-subject rights under the DPDP Act 2023: export everything we hold about a person, delete
 * their account, and enforce the 30-day retention of risk signals.
 */
export class PrivacyService {
  constructor(
    private readonly deps: Deps,
    private readonly devices: DevicesService,
  ) {}

  async export(userId: string): Promise<Record<string, unknown>> {
    const { prisma, cipher } = this.deps;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        devices: true,
        credentials: true,
        account: true,
        payees: { include: { payeeUser: { select: { handle: true } } } },
        guardianLinks: { include: { guardian: { select: { handle: true } } } },
        guardingLinks: { include: { user: { select: { handle: true } } } },
        consents: { orderBy: { createdAt: 'asc' } },
        riskSignals: { orderBy: { createdAt: 'desc' } },
        stepupRequests: { orderBy: { createdAt: 'desc' } },
        recoveries: true,
      },
    });
    const dec = (v: string | null, c: string) => (v ? cipher.decrypt(v, c) : null);
    const transfers = user.account
      ? await prisma.transfer.findMany({
          where: { OR: [{ fromAccountId: user.account.id }, { toAccountId: user.account.id }] },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        handle: user.handle,
        displayName: dec(user.displayNameEnc, ctxUserName(user.id)),
        email: dec(user.emailEnc, ctxUserEmail(user.id)),
        phone: dec(user.phoneEnc, ctxUserPhone(user.id)),
        phoneVerifiedAt: user.phoneVerifiedAt,
        locale: user.locale,
        createdAt: user.createdAt,
      },
      devices: user.devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        name: dec(d.nameEnc, ctxDeviceName(d.id)),
        enrolledAt: d.enrolledAt,
        lastSeenAt: d.lastSeenAt,
        revokedAt: d.revokedAt,
        simChangedAt: d.simChangedAt,
        integrityVerdict: d.integrityVerdict,
      })),
      passkeys: user.credentials.map((c) => ({ id: c.id, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, backedUp: c.backedUp, revokedAt: c.revokedAt })),
      account: user.account
        ? { currency: user.account.currency, balanceMinor: user.account.balanceMinor.toString(), transferLimitMinor: user.account.transferLimitMinor.toString() }
        : null,
      transfers: transfers.map((t) => ({
        id: t.id,
        direction: t.fromAccountId === user.account?.id ? 'out' : 'in',
        amountMinor: t.amountMinor.toString(),
        currency: t.currency,
        memo: dec(t.memoEnc, ctxTransferMemo(t.id)),
        createdAt: t.createdAt,
      })),
      payees: user.payees.map((p) => ({ handle: p.payeeUser.handle, nickname: p.nickname, createdAt: p.createdAt, removedAt: p.removedAt })),
      guardians: user.guardianLinks.map((l) => ({ handle: l.guardian.handle, status: l.status, createdAt: l.createdAt })),
      guarding: user.guardingLinks.map((l) => ({ handle: l.user.handle, status: l.status, createdAt: l.createdAt })),
      consents: user.consents.map((c) => ({ purpose: c.purpose, version: c.version, granted: c.granted, at: c.createdAt })),
      riskSignals: user.riskSignals.map((s) => ({
        at: s.createdAt,
        context: s.context,
        score: s.score,
        matchedRules: s.matchedRules,
        payload: (() => {
          try {
            return cipher.decryptJson(s.payloadEnc, ctxSignalPayload(s.id));
          } catch {
            return null;
          }
        })(),
      })),
      safetyChecks: user.stepupRequests.map((r) => ({ action: r.action, status: r.status, score: r.score, createdAt: r.createdAt })),
      recoveries: user.recoveries.map((r) => ({ status: r.status, createdAt: r.createdAt, completedAt: r.completedAt })),
    };
  }

  /**
   * Delete an account. Personal data is erased; ledger rows stay (other people's transfers point at
   * them) but are reachable only through a pseudonymous ID. Audit events contain IDs only, so the
   * hash chain survives deletion intact. Returns the device IDs revoked, for post-commit cleanup.
   */
  async deleteAccount(tx: Prisma.TransactionClient, log: (i: AuditInput) => Promise<unknown>, userId: string): Promise<string[]> {
    const devices = await tx.device.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    const ids = devices.map((d) => d.id);
    await this.devices.revokeInTx(tx, log, ids, userId, 'account_deleted', { actorType: 'user', actorId: userId });
    await tx.credential.deleteMany({ where: { userId } });
    await tx.riskSignal.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.payee.updateMany({ where: { ownerId: userId, removedAt: null }, data: { removedAt: new Date() } });
    await tx.payee.updateMany({ where: { payeeUserId: userId, removedAt: null }, data: { removedAt: new Date() } });
    await tx.guardianLink.updateMany({
      where: { OR: [{ userId }, { guardianId: userId }], status: { in: ['pending_activation', 'active', 'pending_removal'] } },
      data: { status: 'removed', endedAt: new Date() },
    });
    await tx.invite.updateMany({ where: { inviterId: userId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.stepupRequest.updateMany({
      where: { userId, status: { in: ['pending_user', 'pending_guardians', 'cooloff', 'ready_to_confirm'] } },
      data: { status: 'cancelled', resolvedAt: new Date() },
    });
    await tx.device.updateMany({ where: { userId }, data: { nameEnc: this.deps.cipher.encrypt('', `erased:${userId}`), pushTokenEnc: null, simHash: null } });
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
        handle: `deleted-${userId}`,
        displayNameEnc: this.deps.cipher.encrypt('', ctxUserName(userId)),
        emailEnc: null,
        emailHash: null,
        phoneEnc: null,
        phoneHash: null,
        phoneVerifiedAt: null,
      },
    });
    await log({ actorType: 'user', actorId: userId, action: 'privacy.account_deleted', subjectType: 'user', subjectId: userId });
    return ids;
  }

  /** Retention: risk signals are kept for SIGNAL_RETENTION_DAYS (30 by default). */
  async purgeExpiredSignals(): Promise<number> {
    const cutoff = new Date(Date.now() - this.deps.config.SIGNAL_RETENTION_DAYS * 24 * 3600 * 1000);
    const { count } = await this.deps.prisma.riskSignal.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count > 0) {
      await this.deps.audit.append({ actorType: 'system', action: 'privacy.signals_purged', payload: { count, before: cutoff.toISOString() } });
    }
    return count;
  }
}
