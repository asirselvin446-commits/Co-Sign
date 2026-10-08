import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { Prisma } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { randomToken, sha256B64url } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';

export const USER_AUD = 'cosign:user';
export const ADMIN_AUD = 'cosign:admin';

export interface UserClaims {
  sub: string;
  did: string;
}
export interface AdminClaims {
  sub: string;
  role: 'admin' | 'analyst';
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const revokedDeviceKey = (id: string) => `revoked:dev:${id}`;
const revokedAdminKey = (id: string) => `revoked:adm:${id}`;

export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly deps: Deps) {
    this.key = new TextEncoder().encode(deps.config.JWT_SECRET);
  }

  private async sign(aud: string, sub: string, extra: Record<string, unknown>): Promise<string> {
    return new SignJWT(extra)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.deps.config.PUBLIC_BASE_URL)
      .setAudience(aud)
      .setSubject(sub)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.deps.config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyUser(token: string): Promise<UserClaims> {
    const payload = await this.verify(token, USER_AUD);
    if (typeof payload.did !== 'string') throw new AppError('SESSION_EXPIRED');
    if (await this.deps.redis.exists(revokedDeviceKey(payload.did))) throw new AppError('DEVICE_REVOKED');
    return { sub: payload.sub!, did: payload.did };
  }

  async verifyAdmin(token: string): Promise<AdminClaims> {
    const payload = await this.verify(token, ADMIN_AUD);
    if (payload.role !== 'admin' && payload.role !== 'analyst') throw new AppError('SESSION_EXPIRED');
    if (await this.deps.redis.exists(revokedAdminKey(payload.sub!))) throw new AppError('SESSION_EXPIRED');
    return { sub: payload.sub!, role: payload.role };
  }

  private async verify(token: string, aud: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.deps.config.PUBLIC_BASE_URL,
        audience: aud,
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new AppError('SESSION_EXPIRED');
      return payload;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof joseErrors.JOSEError) throw new AppError('SESSION_EXPIRED');
      throw e;
    }
  }

  // ---------------------------------------------------------------- user sessions

  async issueUserSession(
    tx: Prisma.TransactionClient,
    userId: string,
    deviceId: string,
    familyId: string = randomUUID(),
  ): Promise<SessionTokens> {
    const refreshToken = randomToken(32);
    const expiresAt = new Date(Date.now() + this.deps.config.REFRESH_TOKEN_TTL_SECONDS * 1000);
    await tx.refreshToken.create({
      data: { familyId, userId, deviceId, tokenHash: sha256B64url(refreshToken), expiresAt },
    });
    return {
      accessToken: await this.sign(USER_AUD, userId, { did: deviceId }),
      accessTokenExpiresIn: this.deps.config.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Rotate a refresh token. The token is bound to the device that received it. Presenting an
   * already-used token means it was copied: the whole family is revoked and the event audited.
   */
  async rotateUser(refreshToken: string, deviceId: string): Promise<SessionTokens> {
    const { prisma, audit } = this.deps;
    const tokenHash = sha256B64url(refreshToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { device: true } });
    if (!existing) throw new AppError('SESSION_EXPIRED');

    if (existing.usedAt || existing.revokedAt) {
      if (existing.usedAt && !existing.revokedAt) {
        await audit.transaction(async (tx, log) => {
          await tx.refreshToken.updateMany({
            where: { familyId: existing.familyId, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: 'reuse_detected' },
          });
          await log({
            actorType: 'device',
            actorId: deviceId,
            action: 'auth.refresh_reuse_detected',
            subjectType: 'user',
            subjectId: existing.userId,
            payload: { familyId: existing.familyId, tokenDeviceId: existing.deviceId },
          });
        });
      }
      throw new AppError('SESSION_EXPIRED');
    }
    if (existing.deviceId !== deviceId || existing.device.revokedAt || existing.expiresAt < new Date()) {
      throw new AppError(existing.device.revokedAt ? 'DEVICE_REVOKED' : 'SESSION_EXPIRED');
    }

    return prisma.$transaction(async (tx) => {
      // Conditional update makes concurrent rotations of the same token race-safe: only one wins.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new AppError('SESSION_EXPIRED');
      await tx.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
      return this.issueUserSession(tx, existing.userId, deviceId, existing.familyId);
    });
  }

  async revokeDeviceSessions(tx: Prisma.TransactionClient, deviceIds: string[], reason: string): Promise<void> {
    if (deviceIds.length === 0) return;
    await tx.refreshToken.updateMany({
      where: { deviceId: { in: deviceIds }, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  /** Make already-issued access tokens for these devices fail immediately (they live at most one TTL). */
  async markDevicesRevoked(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    const ttl = this.deps.config.ACCESS_TOKEN_TTL_SECONDS + 60;
    const multi = this.deps.redis.multi();
    for (const id of deviceIds) multi.set(revokedDeviceKey(id), '1', 'EX', ttl);
    await multi.exec();
  }

  // ---------------------------------------------------------------- admin sessions

  async issueAdminSession(
    tx: Prisma.TransactionClient,
    adminId: string,
    role: 'admin' | 'analyst',
    familyId: string = randomUUID(),
  ): Promise<SessionTokens> {
    const refreshToken = randomToken(32);
    const expiresAt = new Date(Date.now() + this.deps.config.ADMIN_REFRESH_TOKEN_TTL_SECONDS * 1000);
    await tx.adminRefreshToken.create({
      data: { familyId, adminId, tokenHash: sha256B64url(refreshToken), expiresAt },
    });
    return {
      accessToken: await this.sign(ADMIN_AUD, adminId, { role }),
      accessTokenExpiresIn: this.deps.config.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  async rotateAdmin(refreshToken: string): Promise<SessionTokens & { adminId: string; role: 'admin' | 'analyst' }> {
    const { prisma, audit } = this.deps;
    const existing = await prisma.adminRefreshToken.findUnique({
      where: { tokenHash: sha256B64url(refreshToken) },
      include: { admin: true },
    });
    if (!existing) throw new AppError('SESSION_EXPIRED');
    if (existing.usedAt || existing.revokedAt) {
      if (existing.usedAt && !existing.revokedAt) {
        await audit.transaction(async (tx, log) => {
          await tx.adminRefreshToken.updateMany({
            where: { familyId: existing.familyId, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: 'reuse_detected' },
          });
          await log({
            actorType: 'admin',
            actorId: existing.adminId,
            action: 'admin.refresh_reuse_detected',
            subjectType: 'admin',
            subjectId: existing.adminId,
            payload: { familyId: existing.familyId },
          });
        });
      }
      throw new AppError('SESSION_EXPIRED');
    }
    if (existing.expiresAt < new Date() || existing.admin.disabledAt) throw new AppError('SESSION_EXPIRED');
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.adminRefreshToken.updateMany({
        where: { id: existing.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new AppError('SESSION_EXPIRED');
      const tokens = await this.issueAdminSession(tx, existing.adminId, existing.admin.role, existing.familyId);
      return { ...tokens, adminId: existing.adminId, role: existing.admin.role };
    });
  }

  async revokeAdminRefresh(refreshToken: string): Promise<void> {
    const row = await this.deps.prisma.adminRefreshToken.findUnique({ where: { tokenHash: sha256B64url(refreshToken) } });
    if (!row) return;
    await this.deps.prisma.adminRefreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  async markAdminRevoked(adminId: string): Promise<void> {
    await this.deps.redis.set(revokedAdminKey(adminId), '1', 'EX', this.deps.config.ACCESS_TOKEN_TTL_SECONDS + 60);
  }
}
