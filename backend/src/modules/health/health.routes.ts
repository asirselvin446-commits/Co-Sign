import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';

export async function healthRoutes(app: ZApp, { deps }: Ctx): Promise<void> {
  app.get(
    '/health/live',
    { schema: { tags: ['health'], response: { 200: z.object({ status: z.literal('ok') }) } }, config: { rateLimit: false } },
    async () => ({ status: 'ok' as const }),
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: {
          200: z.object({ status: z.literal('ok'), database: z.boolean(), redis: z.boolean() }),
          503: z.object({ status: z.literal('degraded'), database: z.boolean(), redis: z.boolean() }),
        },
      },
      config: { rateLimit: false },
    },
    async (_req, reply) => {
      const [database, redis] = await Promise.all([
        deps.prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
        deps.redis.ping().then((r) => r === 'PONG', () => false),
      ]);
      if (database && redis) return { status: 'ok' as const, database, redis };
      return reply.status(503).send({ status: 'degraded' as const, database, redis });
    },
  );
}
