import { randomUUID } from 'node:crypto';
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import type { Prisma, StepupRequest, StepupStatus } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { Lang } from '../../generated/catalog.js';
import { AppError, renderError } from '../../lib/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import type { Services } from '../../services.js';
import type { DeviceSignals } from '../risk/engine.js';
import { toStorable, type Actions, type ExecContext, type SensitiveActionKey } from './actions.js';

export const ctxStepupParams = (id: string) => `stepup.params:${id}`;
export const ctxStepupResult = (id: string) => `stepup.result:${id}`;

const USER_VERIFY_WINDOW_MS = 5 * 60 * 1000;
const CONFIRM_WINDOW_MS = 24 * 3600 * 1000;
export const OPEN_STATUSES: StepupStatus[] = ['pending_user', 'pending_guardians', 'cooloff', 'ready_to_confirm'];

/**
 * The guardian challenge is derived from the request itself:
 *   base64url(sha256(requestId|action|userId|expiresAt|nonce))
 * so a signature approves exactly this request, before this expiry, once (the nonce is single use).
 */
export function guardianChallenge(r: Pick<StepupRequest, 'id' | 'action' | 'userId' | 'expiresAt'>, nonce: string): Buffer {
  return sha256(`${r.id}|${r.action}|${r.userId}|${r.expiresAt.toISOString()}|${nonce}`);
}

export interface StoredReason {
  key: string;
  weight: number;
}

export class StepupService {
  constructor(
    private readonly deps: Deps,
    private readonly services: Services,
    private readonly actions: Actions,
  ) {}

  private def(action: SensitiveActionKey) {
    return this.actions[action];
  }

  // ---------------------------------------------------------------- creation

  async create(input: {
    userId: string;
    deviceId: string;
    action: SensitiveActionKey;
    params: unknown;
    signals?: DeviceSignals | null;
    lang: Lang;
  }): Promise<{ request: StepupRequest; options: PublicKeyCredentialRequestOptionsJSON; reasons: Array<{ key: string; weight: number; reason: string }> }> {
    const { prisma, cipher } = this.deps;
    const def = this.def(input.action);
    const parsed = def.params.safeParse(input.params);
    if (!parsed.success) throw new AppError('INVALID_INPUT', {}, { fields: parsed.error.issues.map((i) => `params.${i.path.join('.')}`) });

    // While someone is moving this account to a new phone, the old phones cannot make changes.
    const recovery = await prisma.recovery.findFirst({ where: { userId: input.userId, status: { in: ['pending_approvals', 'cancel_window', 'ready'] } } });
    if (recovery) throw new AppError('RECOVERY_PENDING', {}, { recoveryId: recovery.id });

    const params = await def.precheck(input.userId, parsed.data as never);
    const id = randomUUID();
    const assessment = await this.services.risk.assess({
      userId: input.userId,
      deviceId: input.deviceId,
      signals: input.signals ?? null,
      lang: input.lang,
      context: `stepup:${input.action}`,
      stepupRequestId: id,
      money:
        input.action === 'transfer_above_limit'
          ? { amountMinor: (params as { amountMinor: bigint }).amountMinor, payeeId: (params as { payeeId: string }).payeeId }
          : null,
    });
    const reasons: StoredReason[] = assessment.matched.map((m) => ({ key: m.key, weight: m.weight }));

    const request = await this.deps.audit.transaction(async (tx, log) => {
      const created = await tx.stepupRequest.create({
        data: {
          id,
          userId: input.userId,
          deviceId: input.deviceId,
          action: input.action,
          paramsEnc: cipher.encryptJson(toStorable(params), ctxStepupParams(id)),
          score: assessment.score,
          reasons: reasons as unknown as Prisma.InputJsonValue,
          ruleSetVersion: assessment.ruleSetVersion,
          needsGuardian: assessment.needsGuardian,
          status: 'pending_user',
          nonce: randomToken(16),
          expiresAt: new Date(Date.now() + USER_VERIFY_WINDOW_MS),
        },
      });
      await log({
        actorType: 'user',
        actorId: input.userId,
        action: 'stepup.created',
        subjectType: 'stepup',
        subjectId: id,
        payload: { action: input.action, score: assessment.score, needsGuardian: assessment.needsGuardian, rules: reasons.map((r) => r.key), ruleSetVersion: assessment.ruleSetVersion, consented: assessment.consented },
      });
      return created;
    });
    const options = await this.userAssertionOptions(request);
    return { request, options, reasons: assessment.matched };
  }

  private async userAssertionOptions(request: StepupRequest): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const creds = await this.deps.prisma.credential.findMany({ where: { userId: request.userId, revokedAt: null }, select: { id: true, transports: true } });
    const options = await this.services.webauthn.authenticationOptions({ allowCredentials: creds });
    await this.services.webauthn.storeChallenge(options.challenge, { purpose: 'stepup_user', requestId: request.id, userId: request.userId, deviceId: request.deviceId });
    return options;
  }

  /** Fresh passkey options for the owner (e.g. confirming after a cool-off, or after the first prompt was dismissed). */
  async optionsForOwner(id: string, userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const request = await this.ownRequest(id, userId);
    if (request.status !== 'pending_user' && request.status !== 'ready_to_confirm') throw new AppError('REQUEST_ALREADY_DECIDED');
    return this.userAssertionOptions(request);
  }

  async ownRequest(id: string, userId: string): Promise<StepupRequest> {
    const request = await this.deps.prisma.stepupRequest.findFirst({ where: { id, userId } });
    if (!request) throw new AppError('NOT_FOUND');
    return request;
  }

  // ---------------------------------------------------------------- user verification

  async verifyUser(id: string, userId: string, _deviceId: string, response: AuthenticationResponseJSON): Promise<StepupRequest> {
    const { webauthn, credentials, guardians } = this.services;
    const request = await this.ownRequest(id, userId);
    const { challenge, record } = await webauthn.takeChallengeFor(response.response.clientDataJSON, 'stepup_user');
    if (record.requestId !== id || record.userId !== userId) throw new AppError('SIGN_IN_FAILED');
    await credentials.verifyAssertion(response, challenge, userId);

    if (request.status === 'ready_to_confirm') {
      if (request.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');
      return this.execute(request, 'ready_to_confirm');
    }
    if (request.status === 'cooloff') {
      throw new AppError('COOLOFF_ACTIVE', {}, { until: request.coolOffUntil!.toISOString(), requestId: id });
    }
    if (request.status !== 'pending_user') throw new AppError('REQUEST_ALREADY_DECIDED');
    if (request.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');

    if (!request.needsGuardian) return this.execute(request, 'pending_user', { userVerifiedAt: new Date() });

    const guardianIds = await guardians.guardianIds(userId);
    if (guardianIds.length === 0) return this.startCoolOff(request, 'pending_user', 'no_guardians');

    const expiresAt = new Date(Date.now() + this.deps.config.STEPUP_GUARDIAN_WINDOW_SECONDS * 1000);
    const updated = await this.transition(request, 'pending_user', { status: 'pending_guardians', userVerifiedAt: new Date(), expiresAt }, 'stepup.awaiting_guardians', {
      guardians: guardianIds.length,
      expiresAt: expiresAt.toISOString(),
    });
    await this.notifyGuardians(updated, guardianIds);
    return updated;
  }

  // ---------------------------------------------------------------- guardian decisions

  async guardianRequestView(id: string, guardianId: string): Promise<StepupRequest> {
    const request = await this.deps.prisma.stepupRequest.findUnique({ where: { id } });
    if (!request || !(await this.services.guardians.isGuardianOf(guardianId, request.userId))) throw new AppError('NOT_FOUND');
    return request;
  }

  async decisionOptions(id: string, guardianId: string, decision: 'approve' | 'deny'): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const request = await this.guardianRequestView(id, guardianId);
    if (request.status !== 'pending_guardians') throw new AppError('REQUEST_ALREADY_DECIDED');
    if (request.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');
    const nonce = randomToken(16);
    const challenge = guardianChallenge(request, nonce);
    const creds = await this.deps.prisma.credential.findMany({ where: { userId: guardianId, revokedAt: null }, select: { id: true, transports: true } });
    const options = await this.services.webauthn.authenticationOptions({ challenge: new Uint8Array(challenge), allowCredentials: creds });
    await this.services.webauthn.storeChallenge(options.challenge, { purpose: 'guardian_decision', requestId: id, guardianId, decision, nonce }, 300);
    return options;
  }

  async decide(id: string, guardianId: string, response: AuthenticationResponseJSON): Promise<{ request: StepupRequest; decision: 'approve' | 'deny' }> {
    const { webauthn, credentials } = this.services;
    const request = await this.guardianRequestView(id, guardianId);
    const { challenge, record } = await webauthn.takeChallengeFor(response.response.clientDataJSON, 'guardian_decision');
    if (record.requestId !== id || record.guardianId !== guardianId) throw new AppError('SIGN_IN_FAILED');
    // Recompute from the stored request: any change to the action, user or expiry breaks the binding.
    if (guardianChallenge(request, record.nonce).toString('base64url') !== challenge) throw new AppError('SIGN_IN_FAILED');
    const credential = await credentials.verifyAssertion(response, challenge, guardianId);

    if (request.status !== 'pending_guardians') throw new AppError('REQUEST_ALREADY_DECIDED');
    if (request.expiresAt < new Date()) throw new AppError('REQUEST_EXPIRED');

    const responseMs = Math.max(0, Date.now() - (request.userVerifiedAt ?? request.createdAt).getTime());
    const decided = await this.deps.audit.transaction(async (tx, log) => {
      const claimed = await tx.stepupRequest.updateMany({
        where: { id, status: 'pending_guardians', expiresAt: { gt: new Date() } },
        data: record.decision === 'approve' ? { status: 'approved' } : { status: 'denied', resolvedAt: new Date(), failureCode: 'GUARDIAN_DENIED' },
      });
      if (claimed.count !== 1) throw new AppError('REQUEST_ALREADY_DECIDED');
      await tx.guardianDecision.create({ data: { requestId: id, guardianId, decision: record.decision, credentialId: credential.id, responseMs } });
      await log({
        actorType: 'guardian',
        actorId: guardianId,
        action: record.decision === 'approve' ? 'stepup.guardian_approved' : 'stepup.guardian_denied',
        subjectType: 'stepup',
        subjectId: id,
        payload: { userId: request.userId, action: request.action, responseMs },
      });
      return tx.stepupRequest.findUniqueOrThrow({ where: { id } });
    });

    await this.closeForGuardians(decided, guardianId);
    if (record.decision === 'deny') {
      await this.notifyOwner(decided);
      return { request: decided, decision: 'deny' };
    }
    return { request: await this.execute(decided, 'approved'), decision: 'approve' };
  }

  // ---------------------------------------------------------------- cancel

  async cancel(id: string, userId: string, deviceId: string): Promise<StepupRequest> {
    const request = await this.ownRequest(id, userId);
    if (!OPEN_STATUSES.includes(request.status)) throw new AppError('REQUEST_ALREADY_DECIDED');
    const updated = await this.transition(request, request.status, { status: 'cancelled', resolvedAt: new Date() }, 'stepup.cancelled', { byDeviceId: deviceId });
    await this.closeForGuardians(updated);
    return updated;
  }

  // ---------------------------------------------------------------- execution

  private async execute(request: StepupRequest, from: StepupStatus, extra: Prisma.StepupRequestUpdateManyMutationInput = {}): Promise<StepupRequest> {
    const def = this.def(request.action as SensitiveActionKey);
    const after: Array<() => Promise<void> | void> = [];
    try {
      const done = await this.deps.audit.transaction(async (tx, log) => {
        const claimed = await tx.stepupRequest.updateMany({ where: { id: request.id, status: from }, data: { ...extra, status: 'approved' } });
        if (claimed.count !== 1) throw new AppError('REQUEST_ALREADY_DECIDED');
        const params = def.params.parse(this.deps.cipher.decryptJson(request.paramsEnc, ctxStepupParams(request.id)));
        const c: ExecContext = { userId: request.userId, deviceId: request.deviceId, stepupId: request.id, tx, log, after: (fn) => after.push(fn) };
        const result = await def.execute(c, params as never);
        await log({ actorType: 'system', action: 'stepup.completed', subjectType: 'stepup', subjectId: request.id, payload: { action: request.action } });
        return tx.stepupRequest.update({
          where: { id: request.id },
          data: { status: 'completed', resolvedAt: new Date(), resultEnc: this.deps.cipher.encryptJson(toStorable(result), ctxStepupResult(request.id)) },
        });
      });
      for (const fn of after) await Promise.resolve(fn()).catch((err: unknown) => this.deps.log.warn({ err }, 'after-commit hook failed'));
      await this.notifyOwner(done);
      return done;
    } catch (e) {
      if (!(e instanceof AppError) || e.code === 'REQUEST_ALREADY_DECIDED') throw e;
      // The action itself failed (e.g. balance changed meanwhile). Record why, so the user hears it.
      const failed = await this.deps.audit.transaction(async (tx, log) => {
        await tx.stepupRequest.updateMany({ where: { id: request.id, status: { in: [from, 'approved'] } }, data: { status: 'failed', resolvedAt: new Date(), failureCode: e.code } });
        await log({ actorType: 'system', action: 'stepup.failed', subjectType: 'stepup', subjectId: request.id, payload: { action: request.action, code: e.code } });
        return tx.stepupRequest.findUniqueOrThrow({ where: { id: request.id } });
      });
      await this.notifyOwner(failed);
      return failed;
    }
  }

  private async transition(
    request: StepupRequest,
    from: StepupStatus,
    data: Prisma.StepupRequestUpdateManyMutationInput,
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<StepupRequest> {
    const updated = await this.deps.audit.transaction(async (tx, log) => {
      const r = await tx.stepupRequest.updateMany({ where: { id: request.id, status: from }, data });
      if (r.count !== 1) throw new AppError('REQUEST_ALREADY_DECIDED');
      await log({ actorType: 'system', action, subjectType: 'stepup', subjectId: request.id, payload: { action: request.action, ...payload } });
      return tx.stepupRequest.findUniqueOrThrow({ where: { id: request.id } });
    });
    await this.notifyOwner(updated);
    return updated;
  }

  /** Never a permanent lockout: the action waits, the person is alerted, and they can cancel any time. */
  private async startCoolOff(request: StepupRequest, from: StepupStatus, reason: 'no_guardians' | 'guardian_timeout'): Promise<StepupRequest> {
    const coolOffUntil = new Date(Date.now() + this.deps.config.COOLOFF_SECONDS * 1000);
    const updated = await this.transition(request, from, { status: 'cooloff', coolOffUntil, ...(from === 'pending_user' ? { userVerifiedAt: new Date() } : {}) }, 'stepup.cooloff_started', {
      reason,
      until: coolOffUntil.toISOString(),
    });
    const { notifier } = this.services;
    await notifier.push(
      request.userId,
      'cooloff_started',
      (lang) => ({ action: notifier.actionLabel(request.action, lang), until: notifier.clock(coolOffUntil.toISOString(), lang) }),
      { screen: 'stepup', requestId: request.id },
    );
    if (reason === 'guardian_timeout') await this.closeForGuardians(updated);
    return updated;
  }

  // ---------------------------------------------------------------- notifications

  private async notifyGuardians(request: StepupRequest, guardianIds: string[]): Promise<void> {
    const { notifier, users } = this.services;
    const owner = await this.deps.prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    const name = users.displayName(owner);
    for (const gid of guardianIds) {
      this.deps.realtime.toUser(gid, 'guardian.request', { requestId: request.id });
      await notifier.push(gid, 'guardian_request', (lang) => ({ name, action: notifier.actionLabel(request.action, lang) }), {
        screen: 'guardian_request',
        requestId: request.id,
      });
    }
  }

  private async closeForGuardians(request: StepupRequest, exceptGuardianId?: string): Promise<void> {
    const ids = await this.services.guardians.guardianIds(request.userId);
    for (const gid of ids) {
      if (gid !== exceptGuardianId) this.deps.realtime.toUser(gid, 'guardian.request.closed', { requestId: request.id, status: request.status });
    }
  }

  private async notifyOwner(request: StepupRequest): Promise<void> {
    this.deps.realtime.toUser(request.userId, 'stepup.updated', { requestId: request.id, status: request.status });
    if (['completed', 'denied', 'failed', 'ready_to_confirm'].includes(request.status)) {
      await this.services.notifier.push(request.userId, 'stepup_resolved', () => ({}), { screen: 'stepup', requestId: request.id });
    }
  }

  // ---------------------------------------------------------------- views

  async ownerView(request: StepupRequest, lang: Lang, consumeResult: boolean) {
    const stored = request.reasons as unknown as StoredReason[];
    const reworded = await this.services.risk.reasonsFor(stored.map((r) => r.key), lang);
    const reasons = stored.map((r, i) => ({ key: r.key, weight: r.weight, reason: reworded[i]!.reason }));
    const [guardiansTotal, decisions] = await Promise.all([
      request.needsGuardian ? this.services.guardians.guardianIds(request.userId).then((g) => g.length) : Promise.resolve(0),
      this.deps.prisma.guardianDecision.count({ where: { requestId: request.id } }),
    ]);
    let result: Record<string, unknown> | null = null;
    if (request.resultEnc) {
      result = this.deps.cipher.decryptJson(request.resultEnc, ctxStepupResult(request.id));
      if (consumeResult && this.def(request.action as SensitiveActionKey).oneTimeResult) {
        await this.deps.prisma.stepupRequest.update({ where: { id: request.id }, data: { resultEnc: null } });
      }
    }
    const failure = request.failureCode ? renderError(new AppError(request.failureCode as never), lang, true, this.deps.config.DISPLAY_TIMEZONE).body.error : null;
    return {
      id: request.id,
      action: request.action,
      actionLabel: this.services.notifier.actionLabel(request.action, lang),
      status: request.status,
      score: request.score,
      needsGuardian: request.needsGuardian,
      reasons,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      coolOffUntil: request.coolOffUntil?.toISOString() ?? null,
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      guardians: { total: guardiansTotal, responded: decisions },
      failure: failure ? { code: failure.code, cause: failure.cause, next: failure.next } : null,
      result,
    };
  }

  async guardianView(request: StepupRequest, guardianId: string, lang: Lang) {
    const { users, notifier, risk } = this.services;
    const owner = await this.deps.prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    const stored = request.reasons as unknown as StoredReason[];
    const reworded = await risk.reasonsFor(stored.map((r) => r.key), lang);
    const mine = await this.deps.prisma.guardianDecision.findUnique({ where: { requestId_guardianId: { requestId: request.id, guardianId } } });
    let summary: string | null = null;
    try {
      const params = this.def(request.action as SensitiveActionKey).params.parse(this.deps.cipher.decryptJson(request.paramsEnc, ctxStepupParams(request.id)));
      summary = await this.def(request.action as SensitiveActionKey).summary(params as never, lang);
    } catch {
      summary = null;
    }
    return {
      id: request.id,
      kind: 'stepup' as const,
      requester: { displayName: users.displayName(owner), handle: owner.handle },
      action: request.action,
      actionLabel: notifier.actionLabel(request.action, lang),
      summary,
      score: request.score,
      reasons: stored.map((r, i) => ({ key: r.key, weight: r.weight, reason: reworded[i]!.reason })),
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      myDecision: mine?.decision ?? null,
    };
  }

  // ---------------------------------------------------------------- jobs

  async runTimers(): Promise<void> {
    const { prisma } = this.deps;
    const now = new Date();

    const userExpired = await prisma.stepupRequest.findMany({ where: { status: 'pending_user', expiresAt: { lt: now } }, take: 100 });
    for (const r of userExpired) await this.transition(r, 'pending_user', { status: 'expired', resolvedAt: now }, 'stepup.expired').catch(() => undefined);

    const guardianTimeouts = await prisma.stepupRequest.findMany({ where: { status: 'pending_guardians', expiresAt: { lt: now } }, take: 100 });
    for (const r of guardianTimeouts) await this.startCoolOff(r, 'pending_guardians', 'guardian_timeout').catch(() => undefined);

    const coolOffDone = await prisma.stepupRequest.findMany({ where: { status: 'cooloff', coolOffUntil: { lt: now } }, take: 100 });
    for (const r of coolOffDone) {
      await this.transition(r, 'cooloff', { status: 'ready_to_confirm', expiresAt: new Date(now.getTime() + CONFIRM_WINDOW_MS) }, 'stepup.cooloff_ended').catch(() => undefined);
    }

    const confirmExpired = await prisma.stepupRequest.findMany({ where: { status: 'ready_to_confirm', expiresAt: { lt: now } }, take: 100 });
    for (const r of confirmExpired) await this.transition(r, 'ready_to_confirm', { status: 'expired', resolvedAt: now }, 'stepup.expired').catch(() => undefined);
  }
}
