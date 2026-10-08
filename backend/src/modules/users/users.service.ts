import { randomUUID } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import type { DeviceInfo } from '../webauthn/webauthn.service.js';

export const ctxUserName = (userId: string) => `user.displayName:${userId}`;
export const ctxUserEmail = (userId: string) => `user.email:${userId}`;
export const ctxUserPhone = (userId: string) => `user.phone:${userId}`;
export const ctxDeviceName = (deviceId: string) => `device.name:${deviceId}`;

const HANDLE_RE = /^[a-z][a-z0-9._]{2,29}$/;
const RESERVED = new Set(['admin', 'administrator', 'support', 'cosign', 'co-sign', 'security', 'root', 'system', 'help', 'staff']);

/** Account handles are case-insensitive and stored lowercase. */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

export function assertValidHandle(handle: string): void {
  if (!HANDLE_RE.test(handle) || RESERVED.has(handle) || /[._]{2}/.test(handle)) {
    throw new AppError('INVALID_INPUT', {}, { fields: ['handle'] });
  }
}

export class UsersService {
  constructor(private readonly deps: Deps) {}

  displayName(user: Pick<User, 'id' | 'displayNameEnc'>): string {
    try {
      return this.deps.cipher.decrypt(user.displayNameEnc, ctxUserName(user.id));
    } catch {
      return '';
    }
  }

  deviceName(device: { id: string; nameEnc: string }): string {
    try {
      return this.deps.cipher.decrypt(device.nameEnc, ctxDeviceName(device.id));
    } catch {
      return '';
    }
  }

  /** Create a user. Caller supplies the transaction. */
  async createUser(
    tx: Prisma.TransactionClient,
    input: { handle: string; displayName: string; locale: string; webauthnUserId: Buffer },
  ): Promise<User> {
    const id = randomUUID();
    try {
      return await tx.user.create({
        data: {
          id,
          handle: input.handle,
          displayNameEnc: this.deps.cipher.encrypt(input.displayName, ctxUserName(id)),
          webauthnUserId: new Uint8Array(input.webauthnUserId),
          locale: input.locale,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new AppError('HANDLE_TAKEN');
      throw e;
    }
  }

  async createDevice(tx: Prisma.TransactionClient, userId: string, info: DeviceInfo) {
    const id = randomUUID();
    return tx.device.create({
      data: {
        id,
        userId,
        platform: info.platform,
        nameEnc: this.deps.cipher.encrypt(info.name.slice(0, 80), ctxDeviceName(id)),
        appVersion: info.appVersion ?? null,
      },
    });
  }

  async requireActiveUser(userId: string): Promise<User> {
    const user = await this.deps.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw new AppError('SESSION_EXPIRED');
    return user;
  }
}
