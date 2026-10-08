import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { accountLimit } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { deviceSignalsSchema } from './engine.js';
import { SIGNAL_CONSENT_PURPOSE } from './risk.service.js';

/** Remote-access apps the Android plugin looks for. The manifest declares the same packages in <queries>. */
export const BUILTIN_REMOTE_ACCESS_PACKAGES = [
  'com.anydesk.anydeskandroid',
  'com.teamviewer.quicksupport.market',
  'com.teamviewer.teamviewer.market.mobile',
  'com.rustdesk.rustdesk',
  'com.airdroid.remote.support',
];

export const CONSENT_VERSION = '2026-10';

export async function signalRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { risk } = services;

  app.get(
    '/v1/signals/config',
    {
      schema: {
        tags: ['signals'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            remoteAccessPackages: z.array(z.string()),
            streamIntervalSeconds: z.number(),
            integrity: z.object({ enabled: z.boolean(), cloudProjectNumber: z.string() }),
            consentVersion: z.string(),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async () => ({
      remoteAccessPackages: [...new Set([...BUILTIN_REMOTE_ACCESS_PACKAGES, ...deps.config.REMOTE_ACCESS_PACKAGES_EXTRA])],
      streamIntervalSeconds: 15,
      integrity: { enabled: deps.integrity.enabled, cloudProjectNumber: deps.config.GOOGLE_CLOUD_PROJECT_NUMBER },
      consentVersion: CONSENT_VERSION,
    }),
  );

  app.post(
    '/v1/signals/integrity-challenge',
    {
      schema: { tags: ['signals'], security: [{ bearer: [] }], response: { 200: z.object({ requestHash: z.string() }) } },
      preHandler: guards.requireUser,
      config: accountLimit(30, '10 minutes'),
    },
    async (req) => ({ requestHash: await risk.integrityChallenge(userAuth(req).deviceId) }),
  );

  app.post(
    '/v1/signals',
    {
      schema: {
        tags: ['signals'],
        security: [{ bearer: [] }],
        summary: 'Stream device signals while a sensitive screen is open (every 15 seconds)',
        body: z.object({ signals: deviceSignalsSchema, stepupId: z.uuid().optional() }),
        response: {
          200: z.object({
            score: z.number(),
            needsGuardian: z.boolean(),
            reasons: z.array(z.object({ key: z.string(), weight: z.number(), reason: z.string() })),
            consented: z.boolean(),
          }),
        },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '1 minute'),
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const previous = await risk.cachedSignals(deviceId);
      const result = await risk.assess({
        userId,
        deviceId,
        signals: req.body.signals,
        lang: req.lang,
        context: 'stream',
        stepupRequestId: req.body.stepupId,
        // Only store a row when something changed; the cache already holds the latest reading.
        persist: JSON.stringify(stripTimes(previous)) !== JSON.stringify(stripTimes(req.body.signals)),
      });
      if (req.body.stepupId) {
        const open = await deps.prisma.stepupRequest.findFirst({ where: { id: req.body.stepupId, userId, status: 'pending_guardians' } });
        if (open) {
          // Guardians see whether the risky situation is still going on while they decide.
          for (const gid of await services.guardians.guardianIds(userId)) {
            deps.realtime.toUser(gid, 'guardian.request.live', { requestId: open.id, liveRules: result.matched.map((m) => m.key), score: result.score });
          }
        }
      }
      return { score: result.score, needsGuardian: result.needsGuardian, reasons: result.matched, consented: result.consented };
    },
  );

  app.get(
    '/v1/consents',
    {
      schema: {
        tags: ['privacy'],
        security: [{ bearer: [] }],
        response: { 200: z.object({ riskSignals: z.object({ granted: z.boolean(), version: z.string().nullable(), at: z.string().nullable() }), currentVersion: z.string() }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const latest = await deps.prisma.consent.findFirst({ where: { userId, purpose: SIGNAL_CONSENT_PURPOSE }, orderBy: { createdAt: 'desc' } });
      return {
        riskSignals: { granted: latest?.granted ?? false, version: latest?.version ?? null, at: latest?.createdAt.toISOString() ?? null },
        currentVersion: CONSENT_VERSION,
      };
    },
  );

  app.put(
    '/v1/consents/risk-signals',
    {
      schema: {
        tags: ['privacy'],
        security: [{ bearer: [] }],
        summary: 'Grant or withdraw consent for scam-signal checks (purpose-limited, kept 30 days)',
        body: z.object({ granted: z.boolean(), version: z.string().max(20) }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId, deviceId } = userAuth(req);
      if (req.body.version !== CONSENT_VERSION) throw new AppError('INVALID_INPUT', {}, { fields: ['version'] });
      await deps.audit.transaction(async (tx, log) => {
        await tx.consent.create({ data: { userId, purpose: SIGNAL_CONSENT_PURPOSE, version: req.body.version, granted: req.body.granted } });
        await log({ actorType: 'user', actorId: userId, action: req.body.granted ? 'privacy.consent_granted' : 'privacy.consent_withdrawn', subjectType: 'user', subjectId: userId, payload: { purpose: SIGNAL_CONSENT_PURPOSE, version: req.body.version } });
      });
      if (!req.body.granted) await deps.redis.del(`sig:${deviceId}`);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/me/export',
    {
      schema: { tags: ['privacy'], security: [{ bearer: [] }], summary: 'Download a copy of all data held about me', response: { 200: z.record(z.string(), z.unknown()) } },
      preHandler: guards.requireUser,
      config: accountLimit(5, '1 hour'),
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      const data = await services.privacy.export(userId);
      await deps.audit.append({ actorType: 'user', actorId: userId, action: 'privacy.exported', subjectType: 'user', subjectId: userId });
      reply.header('content-disposition', 'attachment; filename="co-sign-my-data.json"').header('cache-control', 'no-store');
      return data;
    },
  );
}

function stripTimes(s: unknown): unknown {
  if (!s || typeof s !== 'object') return s;
  const { collectedAt: _c, integrity: _i, ...rest } = s as Record<string, unknown>;
  return rest;
}
