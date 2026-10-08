import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { adminAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { randomToken, sha256B64url } from '../../lib/crypto.js';
import { authenticationResponseSchema, creationOptionsSchema, registrationResponseSchema, requestOptionsSchema } from '../webauthn/schemas.js';
import { challengeFromClientData } from '../webauthn/webauthn.service.js';

export const ADMIN_COOKIE = 'cosign_admin_rt';
const COOKIE_PATH = '/v1/admin/auth';

const adminSession = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number(),
  admin: z.object({ id: z.string(), handle: z.string(), displayName: z.string(), role: z.enum(['admin', 'analyst']) }),
});

/** Dashboard calls must carry this header: it forces a CORS preflight, which blocks cross-site form posts. */
function requireCsrfHeader(req: FastifyRequest): void {
  if (req.headers['x-requested-with'] !== 'cosign-dashboard') throw new AppError('NOT_ALLOWED');
}

export async function adminAuthRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { webauthn, tokens } = services;
  const secureCookie = deps.config.PUBLIC_BASE_URL.startsWith('https://');

  const setRefreshCookie = (reply: FastifyReply, token: string, expiresAt: string) =>
    reply.setCookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: new Date(expiresAt),
    });

  app.post(
    '/v1/admin/auth/register/options',
    {
      schema: {
        tags: ['admin-auth'],
        summary: 'Start staff passkey registration from a one-time invite',
        body: z.object({
          inviteToken: z.string().min(20).max(100),
          handle: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,39}$/),
          displayName: z.string().trim().min(1).max(60),
        }),
        response: { 200: z.object({ options: creationOptionsSchema }) },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      requireCsrfHeader(req);
      const invite = await deps.prisma.adminInvite.findUnique({ where: { tokenHash: sha256B64url(req.body.inviteToken) } });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) throw new AppError('INVITE_INVALID');
      if (await deps.prisma.admin.findUnique({ where: { handle: req.body.handle } })) throw new AppError('HANDLE_TAKEN');
      const webauthnUserId = randomBytes(32);
      const options = await webauthn.registrationOptions({ userId: webauthnUserId, userName: req.body.handle, displayName: req.body.displayName });
      await webauthn.storeChallenge(options.challenge, {
        purpose: 'admin_register',
        inviteId: invite.id,
        handle: req.body.handle,
        displayName: req.body.displayName,
        webauthnUserId: webauthnUserId.toString('base64url'),
      });
      return { options };
    },
  );

  app.post(
    '/v1/admin/auth/register/verify',
    {
      schema: { tags: ['admin-auth'], body: z.object({ response: registrationResponseSchema }), response: { 200: adminSession } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      requireCsrfHeader(req);
      const { challenge, record } = await webauthn.takeChallengeFor(req.body.response.response.clientDataJSON, 'admin_register');
      const verified = await webauthn.verifyRegistration(req.body.response, challenge, 'web');
      const result = await deps.audit.transaction(async (tx, log) => {
        const claimed = await tx.adminInvite.updateMany({
          where: { id: record.inviteId, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new AppError('INVITE_INVALID');
        const invite = await tx.adminInvite.findUniqueOrThrow({ where: { id: record.inviteId } });
        let admin;
        try {
          admin = await tx.admin.create({
            data: {
              handle: record.handle,
              displayName: record.displayName,
              role: invite.role,
              webauthnUserId: new Uint8Array(Buffer.from(record.webauthnUserId, 'base64url')),
              credentials: {
                create: {
                  id: verified.credentialId,
                  publicKey: verified.publicKey,
                  counter: verified.counter,
                  transports: verified.transports,
                  deviceType: verified.deviceType,
                  backedUp: verified.backedUp,
                },
              },
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') throw new AppError('HANDLE_TAKEN');
          throw e;
        }
        await tx.adminInvite.update({ where: { id: invite.id }, data: { usedByAdmin: admin.id } });
        await log({ actorType: 'admin', actorId: admin.id, action: 'admin.registered', subjectType: 'admin', subjectId: admin.id, payload: { role: admin.role, inviteId: invite.id } });
        return { admin, session: await tokens.issueAdminSession(tx, admin.id, admin.role) };
      });
      setRefreshCookie(reply, result.session.refreshToken, result.session.refreshTokenExpiresAt);
      return {
        accessToken: result.session.accessToken,
        accessTokenExpiresIn: result.session.accessTokenExpiresIn,
        admin: { id: result.admin.id, handle: result.admin.handle, displayName: result.admin.displayName, role: result.admin.role },
      };
    },
  );

  app.post(
    '/v1/admin/auth/login/options',
    { schema: { tags: ['admin-auth'], response: { 200: z.object({ options: requestOptionsSchema }) } }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      requireCsrfHeader(req);
      const options = await webauthn.authenticationOptions();
      await webauthn.storeChallenge(options.challenge, { purpose: 'admin_login' });
      return { options };
    },
  );

  app.post(
    '/v1/admin/auth/login/verify',
    {
      schema: { tags: ['admin-auth'], body: z.object({ response: authenticationResponseSchema }), response: { 200: adminSession } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      requireCsrfHeader(req);
      const { response } = req.body;
      const challenge = challengeFromClientData(response.response.clientDataJSON);
      const record = await webauthn.takeChallenge(challenge);
      const credential = await deps.prisma.adminCredential.findUnique({ where: { id: response.id }, include: { admin: true } });
      const fail = async () => {
        await deps.audit.append({ actorType: 'anonymous', action: 'admin.login_failed', payload: {} });
        return new AppError('SIGN_IN_FAILED');
      };
      if (!record || record.purpose !== 'admin_login' || !credential || credential.revokedAt || credential.admin.disabledAt) throw await fail();
      const handle = response.response.userHandle;
      if (handle && Buffer.from(handle, 'base64url').compare(Buffer.from(credential.admin.webauthnUserId)) !== 0) throw await fail();
      let verified;
      try {
        verified = await webauthn.verifyAuthentication(response, challenge, credential, 'web');
      } catch {
        throw await fail();
      }
      const admin = credential.admin;
      const session = await deps.audit.transaction(async (tx, log) => {
        await tx.adminCredential.update({ where: { id: credential.id }, data: { counter: verified.newCounter, lastUsedAt: new Date() } });
        await log({ actorType: 'admin', actorId: admin.id, action: 'admin.login', subjectType: 'admin', subjectId: admin.id });
        return tokens.issueAdminSession(tx, admin.id, admin.role);
      });
      setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
      return {
        accessToken: session.accessToken,
        accessTokenExpiresIn: session.accessTokenExpiresIn,
        admin: { id: admin.id, handle: admin.handle, displayName: admin.displayName, role: admin.role },
      };
    },
  );

  app.post(
    '/v1/admin/auth/refresh',
    { schema: { tags: ['admin-auth'], response: { 200: adminSession } }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      requireCsrfHeader(req);
      const token = req.cookies[ADMIN_COOKIE];
      if (!token) throw new AppError('SESSION_EXPIRED');
      const rotated = await tokens.rotateAdmin(token);
      const admin = await deps.prisma.admin.findUniqueOrThrow({ where: { id: rotated.adminId } });
      setRefreshCookie(reply, rotated.refreshToken, rotated.refreshTokenExpiresAt);
      return {
        accessToken: rotated.accessToken,
        accessTokenExpiresIn: rotated.accessTokenExpiresIn,
        admin: { id: admin.id, handle: admin.handle, displayName: admin.displayName, role: admin.role },
      };
    },
  );

  app.post('/v1/admin/auth/logout', { schema: { tags: ['admin-auth'], response: { 204: z.null() } } }, async (req, reply) => {
    requireCsrfHeader(req);
    const token = req.cookies[ADMIN_COOKIE];
    if (token) await tokens.revokeAdminRefresh(token);
    reply.clearCookie(ADMIN_COOKIE, { path: COOKIE_PATH });
    return reply.status(204).send(null);
  });

  // ------------------------------------------------------------------ staff management (admin role only)

  app.get(
    '/v1/admin/staff',
    {
      schema: {
        tags: ['admin'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            staff: z.array(z.object({ id: z.string(), handle: z.string(), displayName: z.string(), role: z.string(), createdAt: z.string(), disabled: z.boolean() })),
          }),
        },
      },
      preHandler: guards.requireAdmin(['admin']),
    },
    async () => {
      const staff = await deps.prisma.admin.findMany({ orderBy: { createdAt: 'asc' } });
      return {
        staff: staff.map((a) => ({ id: a.id, handle: a.handle, displayName: a.displayName, role: a.role, createdAt: a.createdAt.toISOString(), disabled: a.disabledAt !== null })),
      };
    },
  );

  app.post(
    '/v1/admin/staff/invites',
    {
      schema: {
        tags: ['admin'],
        security: [{ bearer: [] }],
        body: z.object({ role: z.enum(['admin', 'analyst']) }),
        response: { 200: z.object({ url: z.string(), expiresAt: z.string() }) },
      },
      preHandler: guards.requireAdmin(['admin']),
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const created = await createAdminInvite(ctx, req.body.role, adminId);
      return created;
    },
  );

  app.post(
    '/v1/admin/staff/:id/disable',
    {
      schema: { tags: ['admin'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
      preHandler: guards.requireAdmin(['admin']),
    },
    async (req, reply) => {
      const { adminId } = adminAuth(req);
      if (req.params.id === adminId) throw new AppError('NOT_ALLOWED');
      await deps.audit.transaction(async (tx, log) => {
        await tx.admin.update({ where: { id: req.params.id }, data: { disabledAt: new Date() } });
        await tx.adminRefreshToken.updateMany({ where: { adminId: req.params.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'disabled' } });
        await log({ actorType: 'admin', actorId: adminId, action: 'admin.disabled', subjectType: 'admin', subjectId: req.params.id });
      });
      await tokens.markAdminRevoked(req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/admin/me',
    {
      schema: { tags: ['admin'], security: [{ bearer: [] }], response: { 200: adminSession.shape.admin } },
      preHandler: guards.requireAdmin(),
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const a = await deps.prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
      return { id: a.id, handle: a.handle, displayName: a.displayName, role: a.role };
    },
  );
}

export async function createAdminInvite(ctx: Pick<Ctx, 'deps'>, role: 'admin' | 'analyst', issuedById: string | null) {
  const { deps } = ctx;
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await deps.audit.transaction(async (tx, log) => {
    const invite = await tx.adminInvite.create({ data: { tokenHash: sha256B64url(token), role, issuedById, expiresAt } });
    await log({ actorType: issuedById ? 'admin' : 'system', actorId: issuedById, action: 'admin.invite_created', subjectType: 'admin_invite', subjectId: invite.id, payload: { role } });
  });
  const base = deps.config.DASHBOARD_URL || deps.config.PUBLIC_BASE_URL;
  return { url: `${base.replace(/\/$/, '')}/register?invite=${token}`, expiresAt: expiresAt.toISOString() };
}
