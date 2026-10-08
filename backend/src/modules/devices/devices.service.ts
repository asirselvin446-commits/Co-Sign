import type { Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { ActorType, AuditInput } from '../audit/audit.service.js';
import type { TokenService } from '../auth/tokens.js';

export class DevicesService {
  constructor(
    private readonly deps: Deps,
    private readonly tokens: TokenService,
  ) {}

  /** Database part of revoking devices: refresh tokens and passkeys bound to them stop working. */
  async revokeInTx(
    tx: Prisma.TransactionClient,
    log: (i: AuditInput) => Promise<unknown>,
    deviceIds: string[],
    userId: string,
    reason: string,
    actor: { actorType: ActorType; actorId: string | null },
  ): Promise<void> {
    if (deviceIds.length === 0) return;
    const now = new Date();
    await tx.device.updateMany({ where: { id: { in: deviceIds }, userId, revokedAt: null }, data: { revokedAt: now, revokeReason: reason, pushTokenEnc: null } });
    await tx.credential.updateMany({ where: { deviceId: { in: deviceIds }, userId, revokedAt: null }, data: { revokedAt: now } });
    await this.tokens.revokeDeviceSessions(tx, deviceIds, reason);
    for (const id of deviceIds) {
      await log({ ...actor, action: 'device.revoked', subjectType: 'device', subjectId: id, payload: { userId, reason } });
    }
  }

  /** After commit: reject live access tokens and close open sockets. */
  async afterRevoke(deviceIds: string[], userId: string, reason: string): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.tokens.markDevicesRevoked(deviceIds);
    for (const id of deviceIds) {
      this.deps.realtime.toDevice(id, 'session.revoked', { reason });
      this.deps.realtime.disconnectDevice(id);
    }
    this.deps.realtime.toUser(userId, 'device.removed', { deviceIds });
  }

  async revoke(deviceIds: string[], userId: string, reason: string, actor: { actorType: ActorType; actorId: string | null }): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.deps.audit.transaction((tx, log) => this.revokeInTx(tx, log, deviceIds, userId, reason, actor));
    await this.afterRevoke(deviceIds, userId, reason);
  }
}
