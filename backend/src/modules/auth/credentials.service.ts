import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Credential } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import type { WebAuthnService } from '../webauthn/webauthn.service.js';

const FAIL_WINDOW = 15 * 60;

export const failureKey = (userId: string) => `fail:user:${userId}`;

/**
 * Verifies passkey assertions made by end users (sign-in, step-up, guardian decisions, recovery
 * approvals) and keeps the failure counter that feeds the "3+ failures in 15 minutes" risk rule.
 */
export class CredentialsService {
  constructor(
    private readonly deps: Deps,
    private readonly webauthn: WebAuthnService,
  ) {}

  async recordFailure(userId: string): Promise<void> {
    await this.deps.limiter.record(failureKey(userId), FAIL_WINDOW);
  }

  async recentFailures(userId: string): Promise<number> {
    return this.deps.limiter.count(failureKey(userId), FAIL_WINDOW);
  }

  /**
   * Verify an assertion against a stored credential. When `expectedUserId` is given, the
   * credential must belong to that user: a guardian cannot approve with someone else's passkey.
   */
  async verifyAssertion(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    expectedUserId?: string,
  ): Promise<Credential & { user: { id: string; webauthnUserId: Uint8Array; status: string } }> {
    const { prisma } = this.deps;
    const credential = await prisma.credential.findUnique({
      where: { id: response.id },
      include: { user: { select: { id: true, webauthnUserId: true, status: true } } },
    });
    if (!credential || credential.revokedAt || credential.user.status !== 'active') {
      throw new AppError('SIGN_IN_FAILED');
    }
    if (expectedUserId && credential.userId !== expectedUserId) {
      await this.recordFailure(expectedUserId);
      throw new AppError('SIGN_IN_FAILED');
    }
    const userHandle = response.response.userHandle;
    if (userHandle && Buffer.from(userHandle, 'base64url').compare(Buffer.from(credential.user.webauthnUserId)) !== 0) {
      await this.recordFailure(credential.userId);
      throw new AppError('SIGN_IN_FAILED');
    }
    let verified;
    try {
      verified = await this.webauthn.verifyAuthentication(response, expectedChallenge, credential, 'app');
    } catch (e) {
      await this.recordFailure(credential.userId);
      await this.deps.audit.append({
        actorType: 'user',
        actorId: credential.userId,
        action: 'auth.assertion_failed',
        subjectType: 'credential',
        subjectId: credential.id,
      });
      throw e;
    }
    await prisma.credential.update({
      where: { id: credential.id },
      data: { counter: verified.newCounter, lastUsedAt: new Date(), backedUp: verified.backedUp },
    });
    return credential;
  }
}
