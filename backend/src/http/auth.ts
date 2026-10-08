import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Lang } from '../generated/catalog.js';
import { AppError, pickLang } from '../lib/errors.js';
import type { TokenService } from '../modules/auth/tokens.js';

export type AuthContext =
  | { kind: 'user'; userId: string; deviceId: string }
  | { kind: 'admin'; adminId: string; role: 'admin' | 'analyst' };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    lang: Lang;
  }
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

export function makeAuthGuards(tokens: TokenService) {
  /** Requires a user access token issued to an enrolled, non-revoked device. */
  async function requireUser(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = bearer(req);
    if (!token) throw new AppError('SESSION_EXPIRED');
    const claims = await tokens.verifyUser(token);
    req.auth = { kind: 'user', userId: claims.sub, deviceId: claims.did };
  }

  /** Optional user auth: used where unauthenticated callers get generic answers. */
  async function optionalUser(req: FastifyRequest): Promise<void> {
    const token = bearer(req);
    if (!token) return;
    try {
      const claims = await tokens.verifyUser(token);
      req.auth = { kind: 'user', userId: claims.sub, deviceId: claims.did };
    } catch {
      req.auth = null;
    }
  }

  function requireAdmin(roles: Array<'admin' | 'analyst'> = ['admin', 'analyst']) {
    return async (req: FastifyRequest): Promise<void> => {
      const token = bearer(req);
      if (!token) throw new AppError('SESSION_EXPIRED');
      const claims = await tokens.verifyAdmin(token);
      if (!roles.includes(claims.role)) throw new AppError('NOT_ALLOWED');
      req.auth = { kind: 'admin', adminId: claims.sub, role: claims.role };
    };
  }

  return { requireUser, optionalUser, requireAdmin };
}

export type AuthGuards = ReturnType<typeof makeAuthGuards>;

export function userAuth(req: FastifyRequest): { userId: string; deviceId: string } {
  if (req.auth?.kind !== 'user') throw new AppError('SESSION_EXPIRED');
  return { userId: req.auth.userId, deviceId: req.auth.deviceId };
}

export function adminAuth(req: FastifyRequest): { adminId: string; role: 'admin' | 'analyst' } {
  if (req.auth?.kind !== 'admin') throw new AppError('SESSION_EXPIRED');
  return { adminId: req.auth.adminId, role: req.auth.role };
}

export function requestLang(req: FastifyRequest): Lang {
  return pickLang(req.headers['x-cosign-lang'] as string | undefined, req.headers['accept-language']);
}
