import type { Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import type { ActorType } from '../audit/audit.service.js';
import type { TokenService } from '../auth/tokens.js';

export class DevicesService {
  constructor(
    private readonly deps: Deps,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Revoke devices: their refresh tokens and passkeys stop working, open sockets are closed and
   * already-issued access tokens are rejected for their remaining lifetime.
   */
  async revoke(
    deviceIds: string[],
    userId: string,
    reason: string,
    actor: { actorType: ActorType; actorId: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (deviceIds.length === 0) return;
    const work = async (t: Prisma.TransactionClient, log: (i: Parameters<Deps['audit']['append']>[0]) => Promise<unknown>) => {
      const now = new Date();
      await t.device.updateMany({ where: { id: { in: deviceIds }, userId, revokedAt: null }, data: { revokedAt: now, revokeReason: reason, pushTokenEnc: null } });
      await t.credential.updateMany({ where: { deviceId: { in: deviceIds }, userId, revokedAt: null }, data: { revokedAt: now } });
      await this.tokens.revokeDeviceSessions(t, deviceIds, reason);
      for (const id of deviceIds) {
        await log({ ...actor, action: 'device.revoked', subjectType: 'device', subjectId: id, payload: { userId, reason } });
      }
    };
    if (tx) {
      await work(tx, (i) => this.deps.audit.append(i));
    } else {
      await this.deps.audit.transaction((t, log) => work(t, log));
    }
    await this.tokens.markDevicesRevoked(deviceIds);
    for (const id of deviceIds) {
      this.deps.realtime.toDevice(id, 'session.revoked', { reason });
      this.deps.realtime.disconnectDevice(id);
    }
    this.deps.realtime.toUser(userId, 'device.removed', { deviceIds });
  }
}
