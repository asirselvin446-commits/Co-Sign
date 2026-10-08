import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { accountLimit, type Ctx, type ZApp } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { monitorEventSchema } from './monitor.engine.js';
import { MONITOR_CONSENT_PURPOSE } from './monitor.service.js';

export const MONITOR_CONSENT_VERSION = '2026-10';

const reason = z.object({ key: z.string(), weight: z.number(), reason: z.string() });
const alertView = z.object({
  id: z.string(),
  person: z.object({ displayName: z.string(), handle: z.string(), linkId: z.string() }),
  kind: z.string(),
  app: z.object({ category: z.string(), package: z.string().nullable() }).nullable(),
  amountBucket: z.string().nullable(),
  severity: z.string(),
  score: z.number(),
  reasons: z.array(reason),
  occurredAt: z.string(),
  acknowledged: z.boolean(),
  pause: z.object({ id: z.string(), status: z.string() }).nullable(),
});

export async function monitorRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const monitor = services.monitor;
  const tag = { tags: ['family-monitor'] };

  /** Background services on the phone use the monitor token; the open app may use its session. */
  async function monitorDevice(req: FastifyRequest): Promise<{ userId: string; deviceId: string }> {
    const token = req.headers['x-monitor-token'];
    if (typeof token === 'string' && token.length >= 20) return monitor.deviceForToken(token);
    await guards.requireUser(req, undefined as never);
    return userAuth(req);
  }

  // ---------------------------------------------------------------- protected person

  app.get(
    '/v1/monitor/status',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            consented: z.boolean(),
            consentVersion: z.string(),
            enabledOnThisPhone: z.boolean(),
            guardians: z.number(),
            eventsLast24h: z.number(),
            activePause: z.object({ id: z.string(), expiresAt: z.string() }).nullable(),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const [consented, device, guardians, events, pause] = await Promise.all([
        monitor.hasConsent(userId),
        deps.prisma.device.findUnique({ where: { id: deviceId }, select: { monitorTokenHash: true } }),
        services.guardians.guardianIds(userId),
        deps.prisma.monitorEvent.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
        deps.prisma.devicePause.findFirst({ where: { deviceId, status: 'active', expiresAt: { gt: new Date() } } }),
      ]);
      return {
        consented,
        consentVersion: MONITOR_CONSENT_VERSION,
        enabledOnThisPhone: !!device?.monitorTokenHash,
        guardians: guardians.length,
        eventsLast24h: events,
        activePause: pause ? { id: pause.id, expiresAt: pause.expiresAt.toISOString() } : null,
      };
    },
  );

  app.put(
    '/v1/monitor/consent',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'The person on this phone agrees (or stops agreeing) to family protection monitoring',
        body: z.object({ granted: z.boolean(), version: z.literal(MONITOR_CONSENT_VERSION) }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId, deviceId } = userAuth(req);
      await deps.audit.transaction(async (tx, log) => {
        await tx.consent.create({ data: { userId, purpose: MONITOR_CONSENT_PURPOSE, version: req.body.version, granted: req.body.granted } });
        await log({ actorType: 'user', actorId: userId, action: req.body.granted ? 'privacy.consent_granted' : 'privacy.consent_withdrawn', subjectType: 'user', subjectId: userId, payload: { purpose: MONITOR_CONSENT_PURPOSE } });
        // Withdrawing consent stops uploads from every phone at once.
        if (!req.body.granted) await tx.device.updateMany({ where: { userId }, data: { monitorTokenHash: null } });
      });
      void deviceId;
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/monitor/token',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'Issue the upload-only token used by background monitoring on this phone',
        response: { 200: z.object({ token: z.string() }) },
      },
      preHandler: guards.requireUser,
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      return { token: await monitor.issueToken(userId, deviceId) };
    },
  );

  app.delete(
    '/v1/monitor/token',
    { schema: { ...tag, security: [{ bearer: [] }], response: { 204: z.null() } }, preHandler: guards.requireUser },
    async (req, reply) => {
      const { userId, deviceId } = userAuth(req);
      await monitor.revokeToken(userId, deviceId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/monitor/events',
    {
      schema: {
        ...tag,
        summary: 'Upload observed events (categories and ranges only). Header x-monitor-token or bearer.',
        body: z.object({ events: z.array(monitorEventSchema).min(1).max(50) }),
        response: {
          200: z.object({
            results: z.array(
              z.object({ clientId: z.string(), score: z.number(), severity: z.string(), rules: z.array(z.string()), pause: z.boolean(), pauseId: z.string().nullable() }),
            ),
          }),
        },
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { userId, deviceId } = await monitorDevice(req);
      return { results: await monitor.ingest(userId, deviceId, req.body.events) };
    },
  );

  app.get(
    '/v1/monitor/pauses/:id',
    {
      schema: { ...tag, params: z.object({ id: z.uuid() }), response: { 200: z.object({ id: z.string(), status: z.string(), expiresAt: z.string() }) } },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { deviceId } = await monitorDevice(req);
      const p = await monitor.pause(req.params.id, deviceId);
      return { id: p.id, status: p.status, expiresAt: p.expiresAt.toISOString() };
    },
  );

  app.post(
    '/v1/monitor/pauses/:id/dismiss',
    { schema: { ...tag, summary: 'Continue anyway after the countdown', params: z.object({ id: z.uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      const { userId, deviceId } = await monitorDevice(req);
      await monitor.dismiss(req.params.id, userId, deviceId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/monitor/commands',
    {
      schema: {
        ...tag,
        summary: 'What this phone should do now (show a pause, lock the screen). Polled by the background service.',
        response: {
          200: z.object({
            pause: z.object({ id: z.string(), rules: z.array(z.string()), byGuardian: z.boolean(), expiresAt: z.string() }).nullable(),
            lock: z.boolean(),
          }),
        },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => monitor.commands((await monitorDevice(req)).deviceId),
  );

  app.post(
    '/v1/monitor/pauses/:id/ask',
    {
      schema: { ...tag, summary: 'From the pause screen: ask my guardians to let me continue', params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const { userId, deviceId } = await monitorDevice(req);
      await monitor.askRelease(req.params.id, userId, deviceId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/monitor/help',
    {
      schema: { ...tag, summary: '"I need help": alert every guardian now', response: { 204: z.null() } },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const { userId, deviceId } = await monitorDevice(req);
      await monitor.help(userId, deviceId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/monitor/mine',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'My own recent warnings (last 7 days), the same ones my guardians see',
        response: {
          200: z.object({
            alerts: z.array(z.object({ id: z.string(), kind: z.string(), severity: z.string(), reasons: z.array(reason), occurredAt: z.string(), paused: z.boolean() })),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => ({ alerts: await monitor.mine(userAuth(req).userId, req.lang) }),
  );

  // ---------------------------------------------------------------- guardian

  app.post(
    '/v1/guardian/people/:linkId/pause',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: "Pause the person's protected phone now (they can still call you, and continue after a countdown)",
        params: z.object({ linkId: z.uuid() }),
        response: { 200: z.object({ pauseIds: z.array(z.string()) }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '10 minutes'),
    },
    async (req) => monitor.guardianPause(userAuth(req).userId, req.params.linkId),
  );

  app.post(
    '/v1/guardian/people/:linkId/lock',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: "Lock the person's protected phone screen (they unlock it with their own PIN)",
        params: z.object({ linkId: z.uuid() }),
        response: { 200: z.object({ devices: z.number() }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(10, '10 minutes'),
    },
    async (req) => monitor.guardianLock(userAuth(req).userId, req.params.linkId),
  );

  app.get(
    '/v1/guardian/pauses/:id',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({
            id: z.string(),
            status: z.string(),
            byGuardian: z.boolean(),
            person: z.object({ displayName: z.string(), handle: z.string() }),
            reasons: z.array(reason),
            createdAt: z.string(),
            expiresAt: z.string(),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => monitor.pauseForGuardian(req.params.id, userAuth(req).userId, req.lang),
  );

  app.get(
    '/v1/guardian/alerts',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'Alerts about the people I guard (last 7 days). No message text, numbers or screen contents.',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
        response: { 200: z.object({ alerts: z.array(alertView) }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => ({ alerts: await monitor.alertsFor(userAuth(req).userId, req.lang, req.query.limit) }),
  );

  app.post(
    '/v1/guardian/alerts/:id/ack',
    { schema: { ...tag, security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 204: z.null() } }, preHandler: guards.requireUser },
    async (req, reply) => {
      await monitor.acknowledge(req.params.id, userAuth(req).userId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/guardian/pauses/:id/release',
    {
      schema: { ...tag, security: [{ bearer: [] }], summary: 'Release a safety pause after speaking to the person', params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      if (!req.params.id) throw new AppError('INVALID_INPUT');
      await monitor.release(req.params.id, userId);
      return reply.status(204).send(null);
    },
  );
}
