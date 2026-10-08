import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { accountLimit } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { authenticationResponseSchema, requestOptionsSchema } from '../webauthn/schemas.js';

const inviteRef = z.object({ token: z.string().min(20).max(100).optional(), code: z.string().min(4).max(20).optional() }).refine((v) => !!v.token !== !!v.code, 'give token or code');

const reason = z.object({ key: z.string(), weight: z.number(), reason: z.string() });
const stepupRequestView = z.object({
  id: z.string(),
  kind: z.literal('stepup'),
  requester: z.object({ displayName: z.string(), handle: z.string() }),
  action: z.string(),
  actionLabel: z.string(),
  summary: z.string().nullable(),
  score: z.number(),
  reasons: z.array(reason),
  status: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  myDecision: z.enum(['approve', 'deny']).nullable(),
});
const recoveryRequestView = z.object({
  id: z.string(),
  kind: z.literal('recovery'),
  requester: z.object({ displayName: z.string(), handle: z.string() }),
  newDevice: z.object({ platform: z.string(), name: z.string() }),
  status: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  myDecision: z.enum(['approve', 'deny']).nullable(),
});

export async function guardianRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { guardians, users, stepup, recovery } = services;

  // ---------------------------------------------------------------- the protected user

  app.post(
    '/v1/guardians/invites',
    {
      schema: {
        tags: ['guardians'],
        security: [{ bearer: [] }],
        summary: 'Create a guardian invite (share the link, QR code or 8-digit code)',
        response: { 200: z.object({ url: z.string(), code: z.string(), expiresAt: z.string() }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const { url, code, expiresAt } = await guardians.createInvite(userId);
      return { url, code, expiresAt };
    },
  );

  app.get(
    '/v1/guardians',
    {
      schema: {
        tags: ['guardians'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            max: z.number(),
            guardians: z.array(
              z.object({
                linkId: z.string(),
                displayName: z.string(),
                handle: z.string(),
                status: z.string(),
                activatesAt: z.string().nullable(),
                removesAt: z.string().nullable(),
                since: z.string(),
              }),
            ),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const links = await deps.prisma.guardianLink.findMany({
        where: { userId, status: { in: ['pending_activation', 'active', 'pending_removal'] } },
        include: { guardian: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        max: deps.config.MAX_GUARDIANS,
        guardians: links.map((l) => ({
          linkId: l.id,
          displayName: users.displayName(l.guardian),
          handle: l.guardian.handle,
          status: l.status,
          activatesAt: l.status === 'pending_activation' ? l.activatesAt.toISOString() : null,
          removesAt: l.removesAt?.toISOString() ?? null,
          since: (l.activatedAt ?? l.createdAt).toISOString(),
        })),
      };
    },
  );

  app.post(
    '/v1/guardians/:linkId/cancel-change',
    {
      schema: {
        tags: ['guardians'],
        security: [{ bearer: [] }],
        summary: 'Stop a pending guardian addition or removal immediately',
        params: z.object({ linkId: z.uuid() }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      await guardians.cancelPendingChange(userId, req.params.linkId);
      return reply.status(204).send(null);
    },
  );

  // ---------------------------------------------------------------- the guardian

  app.post(
    '/v1/guardian/invites/preview',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        body: inviteRef,
        response: { 200: z.object({ inviter: z.object({ handle: z.string(), displayName: z.string() }), inviteExpiresAt: z.string() }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '15 minutes'),
    },
    async (req) => {
      const { userId } = userAuth(req);
      return guardians.previewInvite(userId, req.body as { token?: string; code?: string });
    },
  );

  app.post(
    '/v1/guardian/invites/accept',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        summary: 'Become a guardian. Takes effect after 24 hours; the protected user is alerted.',
        body: inviteRef,
        response: { 200: z.object({ linkId: z.string(), activatesAt: z.string() }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(20, '15 minutes'),
    },
    async (req) => {
      const { userId } = userAuth(req);
      const link = await guardians.acceptInvite(userId, req.body as { token?: string; code?: string });
      return { linkId: link.id, activatesAt: link.activatesAt.toISOString() };
    },
  );

  app.get(
    '/v1/guardian/people',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        summary: 'People I guard, with their protection status (no message text, numbers or account details)',
        response: {
          200: z.object({
            people: z.array(
              z.object({
                linkId: z.string(),
                displayName: z.string(),
                handle: z.string(),
                status: z.string(),
                activatesAt: z.string().nullable(),
                removesAt: z.string().nullable(),
                /** Only for people I can act for (active links). */
                protection: z
                  .object({
                    on: z.boolean(),
                    lastSeenAt: z.string().nullable(),
                    activePause: z.object({ id: z.string(), byGuardian: z.boolean(), expiresAt: z.string() }).nullable(),
                    lastAlert: z.object({ id: z.string(), severity: z.string(), occurredAt: z.string() }).nullable(),
                  })
                  .nullable(),
              }),
            ),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const links = await deps.prisma.guardianLink.findMany({
        where: { guardianId: userId, status: { in: ['pending_activation', 'active', 'pending_removal'] } },
        include: { user: true },
      });
      const acting = links.filter((l) => l.status !== 'pending_activation').map((l) => l.userId);
      const protection = await services.monitor.protectionFor(acting);
      return {
        people: links.map((l) => ({
          linkId: l.id,
          displayName: users.displayName(l.user),
          handle: l.user.handle,
          status: l.status,
          activatesAt: l.status === 'pending_activation' ? l.activatesAt.toISOString() : null,
          removesAt: l.removesAt?.toISOString() ?? null,
          protection: protection.get(l.userId) ?? null,
        })),
      };
    },
  );

  app.post(
    '/v1/guardian/people/:linkId/resign',
    {
      schema: { tags: ['guardian'], security: [{ bearer: [] }], params: z.object({ linkId: z.uuid() }), response: { 204: z.null() } },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      await guardians.resign(userId, req.params.linkId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/guardian/inbox',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        summary: 'Open approval requests from the people I guard',
        response: { 200: z.object({ requests: z.array(stepupRequestView), recoveries: z.array(recoveryRequestView) }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const protectedIds = (
        await deps.prisma.guardianLink.findMany({ where: { guardianId: userId, status: { in: ['active', 'pending_removal'] } }, select: { userId: true } })
      ).map((l) => l.userId);
      const [reqs, recs] = await Promise.all([
        deps.prisma.stepupRequest.findMany({ where: { userId: { in: protectedIds }, status: 'pending_guardians' }, orderBy: { createdAt: 'desc' } }),
        deps.prisma.recovery.findMany({ where: { userId: { in: protectedIds }, status: 'pending_approvals' }, orderBy: { createdAt: 'desc' } }),
      ]);
      return {
        requests: await Promise.all(reqs.map((r) => stepup.guardianView(r, userId, req.lang))),
        recoveries: await Promise.all(recs.map((r) => recovery.guardianView(r, userId, req.lang))),
      };
    },
  );

  app.get(
    '/v1/guardian/requests/:id',
    {
      schema: { tags: ['guardian'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: stepupRequestView } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      return stepup.guardianView(await stepup.guardianRequestView(req.params.id, userId), userId, req.lang);
    },
  );

  app.post(
    '/v1/guardian/requests/:id/options',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        summary: 'Passkey prompt bound to this request: challenge = base64url(sha256(requestId|action|userId|expiresAt|nonce))',
        params: z.object({ id: z.uuid() }),
        body: z.object({ decision: z.enum(['approve', 'deny']) }),
        response: { 200: z.object({ options: requestOptionsSchema }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      return { options: await stepup.decisionOptions(req.params.id, userId, req.body.decision) };
    },
  );

  app.post(
    '/v1/guardian/requests/:id/decision',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        params: z.object({ id: z.uuid() }),
        body: z.object({ response: authenticationResponseSchema }),
        response: { 200: z.object({ decision: z.enum(['approve', 'deny']), request: stepupRequestView }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(30, '10 minutes'),
    },
    async (req) => {
      const { userId } = userAuth(req);
      const { request, decision } = await stepup.decide(req.params.id, userId, req.body.response);
      return { decision, request: await stepup.guardianView(request, userId, req.lang) };
    },
  );

  app.get(
    '/v1/guardian/recoveries/:id',
    {
      schema: { tags: ['guardian'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: recoveryRequestView } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      return recovery.guardianView(await recovery.guardianRecovery(req.params.id, userId), userId, req.lang);
    },
  );

  app.post(
    '/v1/guardian/recoveries/:id/options',
    {
      schema: { tags: ['guardian'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 200: z.object({ options: requestOptionsSchema }) } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      return { options: await recovery.decisionOptions(req.params.id, userId) };
    },
  );

  app.post(
    '/v1/guardian/recoveries/:id/decision',
    {
      schema: {
        tags: ['guardian'],
        security: [{ bearer: [] }],
        params: z.object({ id: z.uuid() }),
        body: z.object({ decision: z.enum(['approve', 'deny']), response: authenticationResponseSchema }),
        response: { 200: recoveryRequestView },
      },
      preHandler: guards.requireUser,
      config: accountLimit(30, '10 minutes'),
    },
    async (req) => {
      const { userId } = userAuth(req);
      const r = await recovery.decide(req.params.id, userId, req.body.decision, req.body.response);
      return recovery.guardianView(r, userId, req.lang);
    },
  );

  // Browser fallback for invite links when the app is not installed yet.
  app.get('/invite/:token', { schema: { hide: true, params: z.object({ token: z.string().max(100) }) } }, async (_req, reply) => {
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Co-Sign guardian invite</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#14181f}h1{font-size:1.5rem}p{margin:.6em 0}</style></head>
<body><h1>You have been invited to be a guardian</h1>
<p>Install the Co-Sign app, create your own passkey, then open this link again on the same phone.</p>
<p lang="ta">நீங்கள் பாதுகாவலராக அழைக்கப்பட்டுள்ளீர்கள். Co-Sign செயலியை நிறுவி, உங்கள் பாஸ்கீயை உருவாக்கிய பின் இந்த இணைப்பை மீண்டும் திறவுங்கள்.</p>
<p lang="hi">आपको संरक्षक बनने का निमंत्रण मिला है। Co-Sign ऐप इंस्टॉल करें, अपनी पासकी बनाएँ, फिर यही लिंक दोबारा खोलें।</p>
<p>You can also type the 8-digit invite code in the app.</p></body></html>`;
    return reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').type('text/html; charset=utf-8').send(page);
  });
}
