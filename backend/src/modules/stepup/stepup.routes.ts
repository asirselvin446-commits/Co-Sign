import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { accountLimit } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { deviceSignalsSchema } from '../risk/engine.js';
import { authenticationResponseSchema, requestOptionsSchema } from '../webauthn/schemas.js';
import { OPEN_STATUSES } from './stepup.service.js';
import { SENSITIVE_ACTIONS, type SensitiveActionKey } from './actions.js';

export const stepupView = z.object({
  id: z.string(),
  action: z.string(),
  actionLabel: z.string(),
  status: z.string(),
  score: z.number(),
  needsGuardian: z.boolean(),
  reasons: z.array(z.object({ key: z.string(), weight: z.number(), reason: z.string() })),
  createdAt: z.string(),
  expiresAt: z.string(),
  coolOffUntil: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  guardians: z.object({ total: z.number(), responded: z.number() }),
  failure: z.object({ code: z.string(), cause: z.string(), next: z.string() }).nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
});

export async function stepupRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { stepup } = services;

  app.post(
    '/v1/stepup',
    {
      schema: {
        tags: ['step-up'],
        security: [{ bearer: [] }],
        summary: 'Start a sensitive action. Returns the risk assessment and a passkey prompt for the user.',
        body: z.object({
          action: z.enum(SENSITIVE_ACTIONS),
          params: z.record(z.string(), z.unknown()).default({}),
          signals: deviceSignalsSchema.optional(),
        }),
        response: { 200: z.object({ request: stepupView, options: requestOptionsSchema }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '10 minutes'),
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const created = await stepup.create({
        userId,
        deviceId,
        action: req.body.action as SensitiveActionKey,
        params: req.body.params,
        signals: req.body.signals ?? null,
        lang: req.lang,
      });
      return { request: await stepup.ownerView(created.request, req.lang, false), options: created.options };
    },
  );

  app.get(
    '/v1/stepup',
    {
      schema: { tags: ['step-up'], security: [{ bearer: [] }], summary: 'Open safety checks for this account', response: { 200: z.object({ requests: z.array(stepupView) }) } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const rows = await deps.prisma.stepupRequest.findMany({ where: { userId, status: { in: OPEN_STATUSES } }, orderBy: { createdAt: 'desc' } });
      return { requests: await Promise.all(rows.map((r) => stepup.ownerView(r, req.lang, false))) };
    },
  );

  app.get(
    '/v1/stepup/:id',
    {
      schema: { tags: ['step-up'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: stepupView } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const request = await stepup.ownRequest(req.params.id, userId);
      // One-time results (codes, passkey options) are only released to the phone that asked.
      return stepup.ownerView(request, req.lang, request.deviceId === deviceId);
    },
  );

  app.post(
    '/v1/stepup/:id/options',
    {
      schema: { tags: ['step-up'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: z.object({ options: requestOptionsSchema }) } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      return { options: await stepup.optionsForOwner(req.params.id, userId) };
    },
  );

  app.post(
    '/v1/stepup/:id/verify',
    {
      schema: {
        tags: ['step-up'],
        security: [{ bearer: [] }],
        summary: 'Confirm with the user passkey (also used to confirm after a cool-off)',
        params: z.object({ id: z.uuid() }),
        body: z.object({ response: authenticationResponseSchema }),
        response: { 200: stepupView },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '10 minutes'),
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const updated = await stepup.verifyUser(req.params.id, userId, deviceId, req.body.response);
      return stepup.ownerView(updated, req.lang, updated.deviceId === deviceId);
    },
  );

  app.post(
    '/v1/stepup/:id/cancel',
    {
      schema: { tags: ['step-up'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: stepupView } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      return stepup.ownerView(await stepup.cancel(req.params.id, userId, deviceId), req.lang, false);
    },
  );
}
