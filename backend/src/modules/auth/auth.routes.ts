import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { AppError } from '../../lib/errors.js';
import { sha256B64url } from '../../lib/crypto.js';
import { assertValidHandle, normaliseHandle } from '../users/users.service.js';
import {
  authenticationResponseSchema,
  creationOptionsSchema,
  deviceInfoSchema,
  registrationResponseSchema,
  requestOptionsSchema,
  sessionSchema,
} from '../webauthn/schemas.js';
import { challengeFromClientData } from '../webauthn/webauthn.service.js';

const userSummary = z.object({ id: z.string(), handle: z.string(), displayName: z.string(), locale: z.string() });
const authResult = z.object({ user: userSummary, deviceId: z.string(), newDevice: z.boolean(), session: sessionSchema });

export async function authRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services } = ctx;
  const { webauthn, users, tokens, credentials, notifier } = services;

  // ------------------------------------------------------------------ registration

  app.post(
    '/v1/auth/register/options',
    {
      schema: {
        tags: ['auth'],
        summary: 'Start creating an account with a passkey',
        body: z.object({
          handle: z.string().min(3).max(31),
          displayName: z.string().trim().min(1).max(60),
          locale: z.enum(['en', 'ta', 'hi']).default('en'),
          device: deviceInfoSchema,
        }),
        response: { 200: z.object({ options: creationOptionsSchema }) },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const handle = normaliseHandle(req.body.handle);
      assertValidHandle(handle);
      if (await deps.prisma.user.findUnique({ where: { handle }, select: { id: true } })) {
        throw new AppError('HANDLE_TAKEN');
      }
      const webauthnUserId = randomBytes(32);
      const options = await webauthn.registrationOptions({
        userId: webauthnUserId,
        userName: handle,
        displayName: req.body.displayName,
      });
      await webauthn.storeChallenge(options.challenge, {
        purpose: 'user_register',
        handle,
        displayName: req.body.displayName,
        locale: req.body.locale,
        webauthnUserId: webauthnUserId.toString('base64url'),
        device: req.body.device,
      });
      return { options };
    },
  );

  app.post(
    '/v1/auth/register/verify',
    {
      schema: {
        tags: ['auth'],
        summary: 'Finish creating an account',
        body: z.object({ response: registrationResponseSchema }),
        response: { 200: authResult },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { response } = req.body;
      const { challenge, record } = await webauthn.takeChallengeFor(response.response.clientDataJSON, 'user_register');
      const verified = await webauthn.verifyRegistration(response, challenge, 'app');
      if (await deps.prisma.credential.findUnique({ where: { id: verified.credentialId }, select: { id: true } })) {
        throw new AppError('CREDENTIAL_ALREADY_REGISTERED');
      }
      const result = await deps.audit.transaction(async (tx, log) => {
        const user = await users.createUser(tx, {
          handle: record.handle,
          displayName: record.displayName,
          locale: record.locale,
          webauthnUserId: Buffer.from(record.webauthnUserId, 'base64url'),
        });
        const device = await users.createDevice(tx, user.id, record.device);
        await tx.credential.create({
          data: {
            id: verified.credentialId,
            userId: user.id,
            deviceId: device.id,
            publicKey: verified.publicKey,
            counter: verified.counter,
            transports: verified.transports,
            deviceType: verified.deviceType,
            backedUp: verified.backedUp,
            aaguid: verified.aaguid,
          },
        });
        await log({
          actorType: 'user',
          actorId: user.id,
          action: 'user.registered',
          subjectType: 'user',
          subjectId: user.id,
          payload: { deviceId: device.id, platform: device.platform, credentialId: verified.credentialId },
        });
        const session = await tokens.issueUserSession(tx, user.id, device.id);
        return { user, device, session };
      });
      return {
        user: { id: result.user.id, handle: result.user.handle, displayName: record.displayName, locale: result.user.locale },
        deviceId: result.device.id,
        newDevice: true,
        session: result.session,
      };
    },
  );

  // ------------------------------------------------------------------ login (usernameless)

  app.post(
    '/v1/auth/login/options',
    {
      schema: { tags: ['auth'], summary: 'Start signing in (no username)', response: { 200: z.object({ options: requestOptionsSchema }) } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async () => {
      const options = await webauthn.authenticationOptions();
      await webauthn.storeChallenge(options.challenge, { purpose: 'user_login' });
      return { options };
    },
  );

  app.post(
    '/v1/auth/login/verify',
    {
      schema: {
        tags: ['auth'],
        summary: 'Finish signing in',
        body: z.object({
          response: authenticationResponseSchema,
          /** The device ID this app instance already holds, if any. */
          deviceId: z.uuid().optional(),
          device: deviceInfoSchema,
        }),
        response: { 200: authResult },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const ipKey = `signin:ip:${sha256B64url(req.ip)}`;
      await deps.limiter.assertUnder(ipKey, 20, 15 * 60);
      const { response } = req.body;
      let credential;
      try {
        const challenge = challengeFromClientData(response.response.clientDataJSON);
        const record = await webauthn.takeChallenge(challenge);
        if (!record || record.purpose !== 'user_login') throw new AppError('SIGN_IN_FAILED');
        credential = await credentials.verifyAssertion(response, challenge);
      } catch (e) {
        await deps.limiter.record(ipKey, 15 * 60);
        await deps.audit.append({ actorType: 'anonymous', action: 'auth.login_failed', payload: { reason: (e as AppError).code ?? 'error' } });
        throw e instanceof AppError ? new AppError('SIGN_IN_FAILED') : e;
      }

      const user = await users.requireActiveUser(credential.userId);
      const existing = req.body.deviceId
        ? await deps.prisma.device.findFirst({ where: { id: req.body.deviceId, userId: user.id, revokedAt: null } })
        : null;

      const result = await deps.audit.transaction(async (tx, log) => {
        let device = existing;
        if (!device) {
          // A synced passkey used on a phone we have not seen: enrol it as a new device.
          device = await users.createDevice(tx, user.id, req.body.device);
          if (!credential.deviceId) await tx.credential.update({ where: { id: credential.id }, data: { deviceId: device.id } });
        } else {
          await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), appVersion: req.body.device.appVersion ?? device.appVersion } });
        }
        await log({
          actorType: 'user',
          actorId: user.id,
          action: existing ? 'auth.login' : 'auth.login_new_device',
          subjectType: 'device',
          subjectId: device.id,
          payload: { credentialId: credential.id, platform: device.platform },
        });
        const session = await tokens.issueUserSession(tx, user.id, device.id);
        return { device, session };
      });

      if (!existing) {
        await notifier.push(user.id, 'new_device', () => ({}), { screen: 'devices' }, { excludeDeviceId: result.device.id });
        deps.realtime.toUser(user.id, 'device.added', { deviceId: result.device.id });
      }
      return {
        user: { id: user.id, handle: user.handle, displayName: users.displayName(user), locale: user.locale },
        deviceId: result.device.id,
        newDevice: !existing,
        session: result.session,
      };
    },
  );

  // ------------------------------------------------------------------ session

  app.post(
    '/v1/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token (bound to this device)',
        body: z.object({ refreshToken: z.string().min(20).max(200), deviceId: z.uuid() }),
        response: { 200: z.object({ session: sessionSchema }) },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => ({ session: await tokens.rotateUser(req.body.refreshToken, req.body.deviceId) }),
  );

  app.post(
    '/v1/auth/logout',
    {
      schema: { tags: ['auth'], summary: 'Sign out on this device', body: z.object({ refreshToken: z.string().min(20).max(200) }), response: { 204: z.null() } },
      preHandler: ctx.guards.requireUser,
    },
    async (req, reply) => {
      const row = await deps.prisma.refreshToken.findUnique({ where: { tokenHash: sha256B64url(req.body.refreshToken) } });
      if (row && req.auth?.kind === 'user' && row.userId === req.auth.userId) {
        await deps.prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'logout' },
        });
      }
      return reply.status(204).send(null);
    },
  );
}
