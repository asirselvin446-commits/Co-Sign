import { randomUUID } from 'node:crypto';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Recovery } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { Lang } from '../../generated/catalog.js';
import { AppError } from '../../lib/errors.js';
import { randomToken, safeEqual, sha256, sha256B64url } from '../../lib/crypto.js';
import type { Services } from '../../services.js';
import { NOTIFICATIONS } from '../../generated/catalog.js';
import { pickLang } from '../../lib/errors.js';
import { assertValidHandle, ctxUserPhone, normaliseHandle } from '../users/users.service.js';
import type { DeviceInfo } from '../webauthn/webauthn.service.js';
import { recoveryCodeHash } from './codes.js';

export const ctxRecoveryDevice = (id: string) => `recovery.device:${id}`;
const phantomKey = (pollHash: string) => `recphantom:${pollHash}`;
const OPEN = ['pending_approvals', 'cancel_window', 'ready'] as const;

/** Challenge for a guardian's recovery approval, bound to this recovery, user, expiry and a one-time nonce. */
export function recoveryChallenge(r: Pick<Recovery, 'id' | 'userId' | 'expiresAt'>, nonce: string): Buffer {
  return sha256(`${r.id}|recovery|${r.userId}|${r.expiresAt.toISOString()}|${nonce}`);
}

/** Quorum: two guardian approvals when the account has two or more guardians, otherwise one. */
export function requiredApprovals(guardianCount: number): number {
  return guardianCount >= 2 ? 2 : 1;
}

export interface RecoveryStartResult {
  recoveryId: string;
  pollToken: string;
  status: 'pending_approvals';
}

export class RecoveryService {
  constructor(
    private readonly deps: Deps,
    private readonly services: Services,
  ) {}

  // ---------------------------------------------------------------- new phone

  /**
   * Start recovery for an account handle. The response is identical whether or not the account
   * exists (or already has a recovery running), so the endpoint cannot be used to discover accounts.
   */
  async start(rawHandle: string, device: DeviceInfo, ip: string): Promise<RecoveryStartResult> {
    const { prisma, limiter, config, cipher, redis } = this.deps;
    await limiter.consume(`recovery:start:ip:${sha256B64url(ip)}`, 5, 3600);
    const handle = normaliseHandle(rawHandle);
    assertValidHandle(handle);
    await limiter.consume(`recovery:start:handle:${handle}`, 3, 24 * 3600);

    const recoveryId = randomUUID();
    const pollToken = randomToken(32);
    const pollTokenHash = sha256B64url(pollToken);
    const expiresAt = new Date(Date.now() + config.RECOVERY_APPROVAL_WINDOW_SECONDS * 1000);

    const user = await prisma.user.findUnique({ where: { handle } });
    const guardianIds = user && user.status === 'active' ? await this.services.guardians.guardianIds(user.id) : [];
    const open = user ? await prisma.recovery.findFirst({ where: { userId: user.id, status: { in: [...OPEN] } } }) : null;

    if (!user || user.status !== 'active' || open) {
      await redis.set(phantomKey(pollTokenHash), JSON.stringify({ recoveryId }), 'EX', config.RECOVERY_APPROVAL_WINDOW_SECONDS);
      await this.deps.audit.append({ actorType: 'anonymous', action: 'recovery.start_ignored', payload: { reason: open ? 'already_open' : 'no_account' } });
      return { recoveryId, pollToken, status: 'pending_approvals' };
    }

    const recovery = await this.deps.audit.transaction(async (tx, log) => {
      const created = await tx.recovery.create({
        data: {
          id: recoveryId,
          userId: user.id,
          pollTokenHash,
          status: 'pending_approvals',
          requiredApprovals: requiredApprovals(guardianIds.length),
          nonce: randomToken(16),
          newDevicePlatform: device.platform,
          newDeviceNameEnc: cipher.encryptJson(device, ctxRecoveryDevice(recoveryId)),
          expiresAt,
        },
      });
      await log({
        actorType: 'anonymous',
        action: 'recovery.started',
        subjectType: 'user',
        subjectId: user.id,
        payload: { recoveryId, guardians: guardianIds.length, requiredApprovals: created.requiredApprovals },
      });
      return created;
    });

    await this.alertExistingDevices(recovery);
    const name = this.services.users.displayName(user);
    for (const gid of guardianIds) {
      this.deps.realtime.toUser(gid, 'guardian.recovery', { recoveryId });
      await this.services.notifier.push(gid, 'recovery_request', () => ({ name }), { screen: 'guardian_recovery', recoveryId });
    }
    return { recoveryId, pollToken, status: 'pending_approvals' };
  }

  private async findForPoll(recoveryId: string, pollToken: string): Promise<Recovery | 'phantom'> {
    const pollHash = sha256B64url(pollToken);
    const recovery = await this.deps.prisma.recovery.findUnique({ where: { id: recoveryId } });
    if (recovery && safeEqual(recovery.pollTokenHash, pollHash)) return recovery;
    const phantom = await this.deps.redis.get(phantomKey(pollHash));
    if (phantom && (JSON.parse(phantom) as { recoveryId: string }).recoveryId === recoveryId) return 'phantom';
    throw new AppError('NOT_FOUND');
  }

  async pollView(recoveryId: string, pollToken: string) {
    const r = await this.findForPoll(recoveryId, pollToken);
    if (r === 'phantom') return { status: 'pending_approvals' as const, approvals: 0, completesAt: null };
    if (r.status === 'cancelled' || r.status === 'expired' || r.status === 'completed') {
      throw new AppError('RECOVERY_NOT_COMPLETED');
    }
    const approvals = await this.deps.prisma.recoveryApproval.count({ where: { recoveryId } });
    return { status: r.status, approvals, completesAt: r.completesAt?.toISOString() ?? null };
  }

  /** A one-time recovery code can stand in for a guardian when the account has no guardians. */
  async approveWithCode(recoveryId: string, pollToken: string, rawCode: string): Promise<void> {
    const { limiter, prisma, blind } = this.deps;
    const key = `recovery:code:${recoveryId}`;
    await limiter.assertUnder(key, 5, 3600);
    const r = await this.findForPoll(recoveryId, pollToken);
    const fail = async () => {
      await limiter.record(key, 3600);
      return new AppError('CODE_INVALID');
    };
    if (r === 'phantom' || r.status !== 'pending_approvals') throw await fail();
    if ((await this.services.guardians.guardianIds(r.userId)).length > 0) throw await fail();
    const code = await prisma.recoveryCode.findFirst({ where: { userId: r.userId, codeHash: recoveryCodeHash(blind, rawCode), usedAt: null } });
    if (!code) throw await fail();
    await this.deps.audit.transaction(async (tx, log) => {
      const used = await tx.recoveryCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new AppError('CODE_INVALID');
      await tx.recoveryApproval.create({ data: { recoveryId, guardianId: null, method: 'recovery_code' } });
      await log({ actorType: 'anonymous', action: 'recovery.code_used', subjectType: 'recovery', subjectId: recoveryId, payload: { userId: r.userId } });
    });
    await this.checkThreshold(recoveryId);
  }

  async registrationOptions(recoveryId: string, pollToken: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const r = await this.findForPoll(recoveryId, pollToken);
    if (r === 'phantom' || r.status !== 'ready') throw new AppError('RECOVERY_NOT_COMPLETED');
    const user = await this.deps.prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    const options = await this.services.webauthn.registrationOptions({
      userId: user.webauthnUserId,
      userName: user.handle,
      displayName: this.services.users.displayName(user),
    });
    await this.services.webauthn.storeChallenge(options.challenge, { purpose: 'recovery_register', recoveryId });
    return options;
  }

  /** Final step: the new phone registers a passkey, and every old phone and session is revoked. */
  async complete(recoveryId: string, pollToken: string, response: RegistrationResponseJSON) {
    const { webauthn, users, tokens, devices } = this.services;
    const r = await this.findForPoll(recoveryId, pollToken);
    if (r === 'phantom' || r.status !== 'ready') throw new AppError('RECOVERY_NOT_COMPLETED');
    const { challenge, record } = await webauthn.takeChallengeFor(response.response.clientDataJSON, 'recovery_register');
    if (record.recoveryId !== recoveryId) throw new AppError('SIGN_IN_FAILED');
    const verified = await webauthn.verifyRegistration(response, challenge, 'app');
    const deviceInfo = this.deps.cipher.decryptJson<DeviceInfo>(r.newDeviceNameEnc, ctxRecoveryDevice(r.id));
    const oldDevices = await this.deps.prisma.device.findMany({ where: { userId: r.userId, revokedAt: null }, select: { id: true } });
    const oldIds = oldDevices.map((d) => d.id);

    const result = await this.deps.audit.transaction(async (tx, log) => {
      const claimed = await tx.recovery.updateMany({ where: { id: recoveryId, status: 'ready' }, data: { status: 'completed', completedAt: new Date() } });
      if (claimed.count !== 1) throw new AppError('RECOVERY_NOT_COMPLETED');
      await devices.revokeInTx(tx, log, oldIds, r.userId, 'recovered', { actorType: 'system', actorId: null });
      // Synced passkeys not tied to a device record are also retired: the old phone may be in someone else's hands.
      await tx.credential.updateMany({ where: { userId: r.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId: r.userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'recovered' } });
      const device = await users.createDevice(tx, r.userId, deviceInfo);
      await tx.credential.create({
        data: {
          id: verified.credentialId,
          userId: r.userId,
          deviceId: device.id,
          publicKey: verified.publicKey,
          counter: verified.counter,
          transports: verified.transports,
          deviceType: verified.deviceType,
          backedUp: verified.backedUp,
          aaguid: verified.aaguid,
        },
      });
      await tx.recovery.update({ where: { id: recoveryId }, data: { newDeviceId: device.id } });
      await log({
        actorType: 'device',
        actorId: device.id,
        action: 'recovery.completed',
        subjectType: 'user',
        subjectId: r.userId,
        payload: { recoveryId, revokedDevices: oldIds.length },
      });
      const session = await tokens.issueUserSession(tx, r.userId, device.id);
      return { device, session };
    });
    await devices.afterRevoke(oldIds, r.userId, 'recovered');
    const user = await this.deps.prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    return {
      user: { id: user.id, handle: user.handle, displayName: users.displayName(user), locale: user.locale },
      deviceId: result.device.id,
      newDevice: true,
      session: result.session,
    };
  }

  // ---------------------------------------------------------------- guardians

  async guardianRecovery(recoveryId: string, guardianId: string): Promise<Recovery> {
    const r = await this.deps.prisma.recovery.findUnique({ where: { id: recoveryId } });
    if (!r || !(await this.services.guardians.isGuardianOf(guardianId, r.userId))) throw new AppError('NOT_FOUND');
    return r;
  }

  async guardianView(r: Recovery, guardianId: string, lang: Lang) {
    const user = await this.deps.prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    const device = this.deps.cipher.decryptJson<DeviceInfo>(r.newDeviceNameEnc, ctxRecoveryDevice(r.id));
    const mine = await this.deps.prisma.recoveryApproval.findFirst({ where: { recoveryId: r.id, guardianId } });
    void lang;
    return {
      id: r.id,
      kind: 'recovery' as const,
      requester: { displayName: this.services.users.displayName(user), handle: user.handle },
      newDevice: { platform: device.platform, name: device.name },
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      myDecision: mine ? ('approve' as const) : null,
    };
  }

  async decisionOptions(recoveryId: string, guardianId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const r = await this.guardianRecovery(recoveryId, guardianId);
    if (r.status !== 'pending_approvals') throw new AppError('REQUEST_ALREADY_DECIDED');
    if (r.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');
    const nonce = randomToken(16);
    const creds = await this.deps.prisma.credential.findMany({ where: { userId: guardianId, revokedAt: null }, select: { id: true, transports: true } });
    const options = await this.services.webauthn.authenticationOptions({ challenge: new Uint8Array(recoveryChallenge(r, nonce)), allowCredentials: creds });
    await this.services.webauthn.storeChallenge(options.challenge, { purpose: 'recovery_approval', recoveryId, guardianId, nonce }, 300);
    return options;
  }

  async decide(recoveryId: string, guardianId: string, decision: 'approve' | 'deny', response: AuthenticationResponseJSON): Promise<Recovery> {
    const { webauthn, credentials } = this.services;
    const r = await this.guardianRecovery(recoveryId, guardianId);
    const { challenge, record } = await webauthn.takeChallengeFor(response.response.clientDataJSON, 'recovery_approval');
    if (record.recoveryId !== recoveryId || record.guardianId !== guardianId) throw new AppError('SIGN_IN_FAILED');
    if (recoveryChallenge(r, record.nonce).toString('base64url') !== challenge) throw new AppError('SIGN_IN_FAILED');
    const credential = await credentials.verifyAssertion(response, challenge, guardianId);
    if (r.status !== 'pending_approvals') throw new AppError('REQUEST_ALREADY_DECIDED');
    if (r.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');

    if (decision === 'deny') {
      await this.deps.audit.transaction(async (tx, log) => {
        const c = await tx.recovery.updateMany({ where: { id: recoveryId, status: 'pending_approvals' }, data: { status: 'cancelled', cancelledAt: new Date() } });
        if (c.count !== 1) throw new AppError('REQUEST_ALREADY_DECIDED');
        await log({ actorType: 'guardian', actorId: guardianId, action: 'recovery.guardian_denied', subjectType: 'recovery', subjectId: recoveryId, payload: { userId: r.userId } });
      });
      this.deps.realtime.toUser(r.userId, 'recovery.updated', { recoveryId, status: 'cancelled' });
      return this.deps.prisma.recovery.findUniqueOrThrow({ where: { id: recoveryId } });
    }

    await this.deps.audit.transaction(async (tx, log) => {
      try {
        await tx.recoveryApproval.create({ data: { recoveryId, guardianId, method: 'guardian_passkey', credentialId: credential.id } });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') throw new AppError('REQUEST_ALREADY_DECIDED');
        throw e;
      }
      await log({ actorType: 'guardian', actorId: guardianId, action: 'recovery.guardian_approved', subjectType: 'recovery', subjectId: recoveryId, payload: { userId: r.userId } });
    });
    return this.checkThreshold(recoveryId);
  }

  /** Quorum reached: open the cancel window and warn every existing phone. */
  private async checkThreshold(recoveryId: string): Promise<Recovery> {
    const r = await this.deps.prisma.recovery.findUniqueOrThrow({ where: { id: recoveryId } });
    const approvals = await this.deps.prisma.recoveryApproval.count({ where: { recoveryId } });
    if (r.status !== 'pending_approvals' || approvals < r.requiredApprovals) return r;
    const completesAt = new Date(Date.now() + this.deps.config.RECOVERY_CANCEL_WINDOW_SECONDS * 1000);
    const moved = await this.deps.audit.transaction(async (tx, log) => {
      const c = await tx.recovery.updateMany({
        where: { id: recoveryId, status: 'pending_approvals' },
        data: { status: 'cancel_window', thresholdReachedAt: new Date(), completesAt },
      });
      if (c.count !== 1) return false;
      await log({ actorType: 'system', action: 'recovery.threshold_reached', subjectType: 'recovery', subjectId: recoveryId, payload: { userId: r.userId, approvals, completesAt: completesAt.toISOString() } });
      return true;
    });
    const updated = await this.deps.prisma.recovery.findUniqueOrThrow({ where: { id: recoveryId } });
    if (moved) await this.alertExistingDevices(updated);
    return updated;
  }

  private async alertExistingDevices(r: Recovery): Promise<void> {
    this.deps.realtime.toUser(r.userId, 'recovery.alert', { recoveryId: r.id, status: r.status, completesAt: r.completesAt?.toISOString() ?? null });
    await this.services.notifier.push(r.userId, 'recovery_alert', () => ({}), { screen: 'recovery_alert', recoveryId: r.id });
    const user = await this.deps.prisma.user.findUnique({ where: { id: r.userId } });
    if (user?.phoneEnc && user.phoneVerifiedAt && this.deps.sms.enabled) {
      const phone = this.deps.cipher.decrypt(user.phoneEnc, ctxUserPhone(user.id));
      const text = NOTIFICATIONS.recovery_alert[pickLang(user.locale)];
      await this.deps.sms.send(phone, `Co-Sign: ${text.title}. ${text.body}`);
    }
  }

  // ---------------------------------------------------------------- the real owner, on an existing phone

  async activeForUser(userId: string) {
    const r = await this.deps.prisma.recovery.findFirst({ where: { userId, status: { in: [...OPEN] } } });
    if (!r) return null;
    const device = this.deps.cipher.decryptJson<DeviceInfo>(r.newDeviceNameEnc, ctxRecoveryDevice(r.id));
    const approvals = await this.deps.prisma.recoveryApproval.count({ where: { recoveryId: r.id } });
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      completesAt: r.completesAt?.toISOString() ?? null,
      approvals,
      requiredApprovals: r.requiredApprovals,
      newDevice: { platform: device.platform, name: device.name },
    };
  }

  async cancel(userId: string, deviceId: string, recoveryId: string): Promise<void> {
    await this.deps.audit.transaction(async (tx, log) => {
      const c = await tx.recovery.updateMany({
        where: { id: recoveryId, userId, status: { in: ['pending_approvals', 'cancel_window', 'ready'] } },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledByDevice: deviceId },
      });
      if (c.count !== 1) throw new AppError('NOT_FOUND');
      await log({ actorType: 'user', actorId: userId, action: 'recovery.cancelled', subjectType: 'recovery', subjectId: recoveryId, payload: { deviceId } });
    });
    this.deps.realtime.toUser(userId, 'recovery.updated', { recoveryId, status: 'cancelled' });
    for (const gid of await this.services.guardians.guardianIds(userId)) {
      this.deps.realtime.toUser(gid, 'guardian.request.closed', { recoveryId });
    }
  }

  // ---------------------------------------------------------------- jobs

  async runTimers(): Promise<void> {
    const { prisma } = this.deps;
    const now = new Date();
    const expired = await prisma.recovery.findMany({ where: { status: 'pending_approvals', expiresAt: { lt: now } }, take: 100 });
    for (const r of expired) {
      await this.deps.audit.transaction(async (tx, log) => {
        const c = await tx.recovery.updateMany({ where: { id: r.id, status: 'pending_approvals' }, data: { status: 'expired' } });
        if (c.count === 1) await log({ actorType: 'system', action: 'recovery.expired', subjectType: 'recovery', subjectId: r.id });
      });
    }
    const due = await prisma.recovery.findMany({ where: { status: 'cancel_window', completesAt: { lte: now } }, take: 100 });
    for (const r of due) {
      const moved = await this.deps.audit.transaction(async (tx, log) => {
        const c = await tx.recovery.updateMany({ where: { id: r.id, status: 'cancel_window' }, data: { status: 'ready' } });
        if (c.count === 1) await log({ actorType: 'system', action: 'recovery.ready', subjectType: 'recovery', subjectId: r.id });
        return c.count === 1;
      });
      if (moved) this.deps.realtime.toUser(r.userId, 'recovery.updated', { recoveryId: r.id, status: 'ready' });
    }
  }
}

