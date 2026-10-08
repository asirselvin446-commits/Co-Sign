import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { assertAsciiCode } from '../guardians/guardians.service.js';
import { deviceLinkKey } from '../stepup/actions.js';
import { creationOptionsSchema, deviceInfoSchema, registrationResponseSchema, sessionSchema } from '../webauthn/schemas.js';

/**
 * Adding passkeys and phones. Both start as sensitive actions (step-up); these endpoints finish them:
 *  - add_passkey returns registration options; the same phone posts the new credential here.
 *  - add_device shows an 8-digit code on the old phone; the new phone types it here and registers.
 */
export async function enrolmentRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { webauthn, users, tokens, notifier } = services;

  app.post(
    '/v1/passkeys/register',
    {
      schema: { tags: ['devices'], security: [{ bearer: [] }], body: z.object({ response: registrationResponseSchema }), response: { 200: z.object({ credentialId: z.string() }) } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const { challenge, record } = await webauthn.takeChallengeFor(req.body.response.response.clientDataJSON, 'user_add_passkey');
      if (record.userId !== userId || record.deviceId !== deviceId) throw new AppError('SIGN_IN_FAILED');
      const v = await webauthn.verifyRegistration(req.body.response, challenge, 'app');
      if (await deps.prisma.credential.findUnique({ where: { id: v.credentialId } })) throw new AppError('CREDENTIAL_ALREADY_REGISTERED');
      await deps.audit.transaction(async (tx, log) => {
        await tx.credential.create({
          data: { id: v.credentialId, userId, deviceId, publicKey: v.publicKey, counter: v.counter, transports: v.transports, deviceType: v.deviceType, backedUp: v.backedUp, aaguid: v.aaguid },
        });
        await log({ actorType: 'user', actorId: userId, action: 'passkey.added', subjectType: 'credential', subjectId: v.credentialId, payload: { stepupRequestId: record.stepupId } });
      });
      return { credentialId: v.credentialId };
    },
  );

  app.post(
    '/v1/device-link/options',
    {
      schema: {
        tags: ['devices'],
        summary: 'New phone: enter the 8-digit code shown on your existing phone',
        body: z.object({ code: z.string().min(8).max(20), device: deviceInfoSchema }),
        response: { 200: z.object({ options: creationOptionsSchema }) },
      },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req) => {
      const code = assertAsciiCode(req.body.code);
      const limitKey = `devlink:ip:${req.ip}`;
      await deps.limiter.assertUnder(limitKey, 5, 900);
      const raw = /^\d{8}$/.test(code) ? await deps.redis.getdel(deviceLinkKey(deps.blind.of('device-link', code))) : null;
      if (!raw) {
        await deps.limiter.record(limitKey, 900);
        throw new AppError('CODE_INVALID');
      }
      const { userId, linkId } = JSON.parse(raw) as { userId: string; linkId: string };
      const user = await users.requireActiveUser(userId);
      const existing = await deps.prisma.credential.findMany({ where: { userId, revokedAt: null }, select: { id: true, transports: true } });
      const options = await webauthn.registrationOptions({
        userId: user.webauthnUserId,
        userName: user.handle,
        displayName: users.displayName(user),
        exclude: existing,
      });
      await webauthn.storeChallenge(options.challenge, { purpose: 'device_link', userId, linkId, device: req.body.device }, 300);
      return { options };
    },
  );

  app.post(
    '/v1/device-link/verify',
    {
      schema: {
        tags: ['devices'],
        body: z.object({ response: registrationResponseSchema }),
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
    async (req) => {
      const { challenge, record } = await webauthn.takeChallengeFor(req.body.response.response.clientDataJSON, 'device_link');
      const v = await webauthn.verifyRegistration(req.body.response, challenge, 'app');
      if (await deps.prisma.credential.findUnique({ where: { id: v.credentialId } })) throw new AppError('CREDENTIAL_ALREADY_REGISTERED');
      const user = await users.requireActiveUser(record.userId);
      const result = await deps.audit.transaction(async (tx, log) => {
        const device = await users.createDevice(tx, user.id, record.device);
        await tx.credential.create({
          data: { id: v.credentialId, userId: user.id, deviceId: device.id, publicKey: v.publicKey, counter: v.counter, transports: v.transports, deviceType: v.deviceType, backedUp: v.backedUp, aaguid: v.aaguid },
        });
        await log({ actorType: 'user', actorId: user.id, action: 'device.linked', subjectType: 'device', subjectId: device.id, payload: { linkId: record.linkId } });
        return { device, session: await tokens.issueUserSession(tx, user.id, device.id) };
      });
      await notifier.push(user.id, 'new_device', () => ({}), { screen: 'devices' }, { excludeDeviceId: result.device.id });
      deps.realtime.toUser(user.id, 'device.added', { deviceId: result.device.id });
      return {
        user: { id: user.id, handle: user.handle, displayName: users.displayName(user), locale: user.locale },
        deviceId: result.device.id,
        newDevice: true,
        session: result.session,
      };
    },
  );

  app.post(
    '/v1/me/phone/verify',
    {
      schema: {
        tags: ['account'],
        security: [{ bearer: [] }],
        summary: 'Confirm a new phone number with the SMS code',
        body: z.object({ code: z.string().min(1).max(20) }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      await services.phone.verify(userAuth(req).userId, req.body.code);
      return reply.status(204).send(null);
    },
  );
}
