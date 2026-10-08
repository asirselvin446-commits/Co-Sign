import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { creationOptionsSchema, deviceInfoSchema, registrationResponseSchema, sessionSchema } from '../webauthn/schemas.js';

const poll = z.object({ pollToken: z.string().min(20).max(100) });

export async function recoveryRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { services, guards } = ctx;
  const { recovery } = services;

  // ---------------------------------------------------------------- new phone (not signed in)

  app.post(
    '/v1/recovery/start',
    {
      schema: {
        tags: ['recovery'],
        summary: 'I lost my phone: start recovery. The answer is the same whether or not the account exists.',
        body: z.object({ handle: z.string().min(1).max(40), device: deviceInfoSchema }),
        response: { 200: z.object({ recoveryId: z.string(), pollToken: z.string(), status: z.literal('pending_approvals') }) },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (req) => recovery.start(req.body.handle, req.body.device, req.ip),
  );

  app.post(
    '/v1/recovery/:id/status',
    {
      schema: {
        tags: ['recovery'],
        params: z.object({ id: z.uuid() }),
        body: poll,
        response: { 200: z.object({ status: z.string(), approvals: z.number(), completesAt: z.string().nullable() }) },
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req) => recovery.pollView(req.params.id, req.body.pollToken),
  );

  app.post(
    '/v1/recovery/:id/code',
    {
      schema: {
        tags: ['recovery'],
        summary: 'Use a one-time recovery code (accounts without guardians)',
        params: z.object({ id: z.uuid() }),
        body: poll.extend({ code: z.string().min(8).max(20) }),
        response: { 204: z.null() },
      },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      await recovery.approveWithCode(req.params.id, req.body.pollToken, req.body.code);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/recovery/:id/register/options',
    {
      schema: { tags: ['recovery'], params: z.object({ id: z.uuid() }), body: poll, response: { 200: z.object({ options: creationOptionsSchema }) } },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req) => ({ options: await recovery.registrationOptions(req.params.id, req.body.pollToken) }),
  );

  app.post(
    '/v1/recovery/:id/register/verify',
    {
      schema: {
        tags: ['recovery'],
        summary: 'Register the new phone. All old phones and sessions are signed out.',
        params: z.object({ id: z.uuid() }),
        body: poll.extend({ response: registrationResponseSchema }),
        response: {
          200: z.object({
            user: z.object({ id: z.string(), handle: z.string(), displayName: z.string(), locale: z.string() }),
            deviceId: z.string(),
            newDevice: z.boolean(),
            session: sessionSchema,
          }),
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req) => recovery.complete(req.params.id, req.body.pollToken, req.body.response),
  );

  // ---------------------------------------------------------------- the owner, on an existing phone

  app.get(
    '/v1/recovery/active',
    {
      schema: {
        tags: ['recovery'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            recovery: z
              .object({
                id: z.string(),
                status: z.string(),
                createdAt: z.string(),
                completesAt: z.string().nullable(),
                approvals: z.number(),
                requiredApprovals: z.number(),
                newDevice: z.object({ platform: z.string(), name: z.string() }),
              })
              .nullable(),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => ({ recovery: await recovery.activeForUser(userAuth(req).userId) }),
  );

  app.post(
    '/v1/recovery/:id/cancel',
    {
      schema: { tags: ['recovery'], security: [{ bearer: [] }], summary: 'This was not me: cancel the recovery', params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId, deviceId } = userAuth(req);
      await recovery.cancel(userId, deviceId, req.params.id);
      return reply.status(204).send(null);
    },
  );
}
