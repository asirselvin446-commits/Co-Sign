import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Deps } from '../deps.js';
import type { Services } from '../services.js';
import type { AuthGuards } from './auth.js';

export type ZApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface Ctx {
  deps: Deps;
  services: Services;
  guards: AuthGuards;
}

/** Per-account limit evaluated after authentication (falls back to IP for anonymous calls). */
export function accountLimit(max: number, timeWindow: string) {
  return {
    rateLimit: {
      max,
      timeWindow,
      hook: 'preHandler' as const,
      keyGenerator: (req: { auth: { kind: string; userId?: string; adminId?: string } | null; ip: string }) =>
        req.auth?.kind === 'user' ? `u:${req.auth.userId}` : req.auth?.kind === 'admin' ? `a:${req.auth.adminId}` : `ip:${req.ip}`,
    },
  };
}
