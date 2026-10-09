import { z } from 'zod';
import { accountLimit, type Ctx, type ZApp } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { callContextSchema } from '../monitor/monitor.engine.js';
import { monitorDeviceResolver } from '../monitor/monitor.routes.js';

const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
/** An uncompressed P-256 public key in SPKI form is 91 bytes (124 base64 chars). */
const PUBLIC_KEY = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(100).max(200);
/** Sealed answer: JSON {v, epk, iv, ct}, base64 inside. Opaque to the server. */
const CIPHERTEXT = z.string().min(40).max(4096);

const target = z.object({
  id: z.string(),
  mode: z.enum(['fill', 'show']),
  status: z.string(),
  target: z.object({
    package: z.string().nullable(),
    host: z.string().nullable(),
    domain: z.string().nullable(),
    appLabel: z.string(),
    verdict: z.string(),
    brand: z.string().nullable(),
  }),
  createdAt: z.string(),
  expiresAt: z.string(),
  answeredAt: z.string().nullable(),
});

const guardianView = target.extend({
  person: z.object({ displayName: z.string(), handle: z.string(), linkId: z.string().nullable() }),
  publicKey: z.string().nullable(),
  reasons: z.array(z.object({ key: z.string(), reason: z.string() })),
  answeredByMe: z.boolean(),
});

export async function signinRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { services, guards } = ctx;
  const signin = services.signin;
  const tag = { tags: ['assisted-sign-in'] };
  const monitorDevice = monitorDeviceResolver(ctx);

  // ---------------------------------------------------------------- the person's phone

  app.post(
    '/v1/signin',
    {
      schema: {
        ...tag,
        summary: 'Ask my guardian to sign me in to this app or website. Header x-monitor-token or bearer.',
        body: z.object({
          mode: z.enum(['fill', 'show']).default('fill'),
          target: z
            .object({
              package: z.string().regex(PACKAGE).max(150).nullable().default(null),
              webDomain: z.string().regex(HOST).max(253).nullable().default(null),
              appLabel: z.string().trim().min(1).max(80),
            })
            .refine((t) => t.package !== null || t.webDomain !== null, 'an app or a website is needed'),
          publicKey: PUBLIC_KEY,
          call: callContextSchema.nullable().default(null),
        }),
        response: { 200: z.object({ id: z.string(), status: z.string(), expiresAt: z.string() }) },
      },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req) => {
      const { userId, deviceId } = await monitorDevice(req);
      const r = await signin.create({ userId, deviceId, mode: req.body.mode, target: req.body.target, publicKey: req.body.publicKey, call: req.body.call });
      return { id: r.id, status: r.status, expiresAt: r.expiresAt.toISOString() };
    },
  );

  app.get(
    '/v1/signin/:id',
    {
      schema: {
        ...tag,
        summary: 'Status of my request. A filled answer (sealed to this phone) is returned once, then deleted.',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ status: z.string(), expiresAt: z.string(), guardianName: z.string().nullable(), ciphertext: z.string().nullable() }) },
      },
      config: { rateLimit: { max: 90, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { deviceId } = await monitorDevice(req);
      const { request, ciphertext, guardianName } = await signin.poll(req.params.id, deviceId);
      return { status: request.status, expiresAt: request.expiresAt.toISOString(), guardianName, ciphertext };
    },
  );

  app.post(
    '/v1/signin/:id/cancel',
    { schema: { ...tag, params: z.object({ id: z.uuid() }), response: { 204: z.null() } }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { deviceId } = await monitorDevice(req);
      await signin.cancel(req.params.id, deviceId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/signin',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'My recent assisted sign-ins (which app, who helped, when). No passwords, ever.',
        response: { 200: z.object({ requests: z.array(target.extend({ guardianName: z.string().nullable() })) }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => ({ requests: await signin.mine(userAuth(req).userId) }),
  );

  // ---------------------------------------------------------------- the guardian

  app.get(
    '/v1/guardian/signin',
    {
      schema: { ...tag, security: [{ bearer: [] }], summary: 'Open sign-in requests from the people I guard', response: { 200: z.object({ requests: z.array(guardianView) }) } },
      preHandler: guards.requireUser,
    },
    async (req) => ({ requests: await signin.openFor(userAuth(req).userId, req.lang) }),
  );

  app.get(
    '/v1/guardian/signin/:id',
    {
      schema: { ...tag, security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: guardianView } },
      preHandler: guards.requireUser,
    },
    async (req) => signin.guardianView(req.params.id, userAuth(req).userId, req.lang),
  );

  app.post(
    '/v1/guardian/signin/:id/answer',
    {
      schema: {
        ...tag,
        security: [{ bearer: [] }],
        summary: 'Answer from my signed-in phone. "fill" carries the password sealed to the asking phone; the server cannot read it. "deny" needs nothing else.',
        params: z.object({ id: z.uuid() }),
        body: z
          .object({ decision: z.enum(['fill', 'deny']), ciphertext: CIPHERTEXT.nullable().default(null) })
          .refine((b) => b.decision === 'deny' || b.ciphertext !== null, { message: 'fill needs the sealed answer', path: ['ciphertext'] }),
        response: { 200: z.object({ status: z.string() }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(30, '10 minutes'),
    },
    async (req) => {
      const r = await signin.answer(req.params.id, userAuth(req).userId, req.body.decision, req.body.ciphertext);
      return { status: r.status };
    },
  );
}
