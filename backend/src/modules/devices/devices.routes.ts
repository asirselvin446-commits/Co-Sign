import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { pushTokenContext } from '../push/push.service.js';
import { ctxUserEmail, ctxUserName, ctxUserPhone } from '../users/users.service.js';

const deviceView = z.object({
  id: z.string(),
  platform: z.enum(['android', 'ios', 'web']),
  name: z.string(),
  appVersion: z.string().nullable(),
  enrolledAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
  pushEnabled: z.boolean(),
});

export async function deviceRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { users } = services;

  app.get(
    '/v1/me',
    {
      schema: {
        tags: ['account'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            id: z.string(),
            handle: z.string(),
            displayName: z.string(),
            locale: z.string(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            createdAt: z.string(),
            deviceId: z.string(),
            guardians: z.number(),
            guarding: z.number(),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const user = await users.requireActiveUser(userId);
      const [guardians, guarding] = await Promise.all([
        deps.prisma.guardianLink.count({ where: { userId, status: { in: ['active', 'pending_removal'] } } }),
        deps.prisma.guardianLink.count({ where: { guardianId: userId, status: { in: ['active', 'pending_removal'] } } }),
      ]);
      const dec = (v: string | null, c: string) => (v ? deps.cipher.decrypt(v, c) : null);
      return {
        id: user.id,
        handle: user.handle,
        displayName: users.displayName(user),
        locale: user.locale,
        email: dec(user.emailEnc, ctxUserEmail(user.id)),
        phone: dec(user.phoneEnc, ctxUserPhone(user.id)),
        createdAt: user.createdAt.toISOString(),
        deviceId,
        guardians,
        guarding,
      };
    },
  );

  app.patch(
    '/v1/me',
    {
      schema: {
        tags: ['account'],
        security: [{ bearer: [] }],
        body: z.object({ locale: z.enum(['en', 'ta', 'hi']).optional(), displayName: z.string().trim().min(1).max(60).optional() }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      await deps.prisma.user.update({
        where: { id: userId },
        data: {
          ...(req.body.locale ? { locale: req.body.locale } : {}),
          ...(req.body.displayName ? { displayNameEnc: deps.cipher.encrypt(req.body.displayName, ctxUserName(userId)) } : {}),
        },
      });
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/v1/devices',
    {
      schema: { tags: ['devices'], security: [{ bearer: [] }], response: { 200: z.object({ devices: z.array(deviceView) }) } },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId, deviceId } = userAuth(req);
      const devices = await deps.prisma.device.findMany({ where: { userId, revokedAt: null }, orderBy: { enrolledAt: 'asc' } });
      return {
        devices: devices.map((d) => ({
          id: d.id,
          platform: d.platform,
          name: users.deviceName(d),
          appVersion: d.appVersion,
          enrolledAt: d.enrolledAt.toISOString(),
          lastSeenAt: d.lastSeenAt.toISOString(),
          current: d.id === deviceId,
          pushEnabled: d.pushTokenEnc !== null,
        })),
      };
    },
  );

  app.put(
    '/v1/devices/current/push-token',
    {
      schema: {
        tags: ['devices'],
        security: [{ bearer: [] }],
        summary: 'Register this device for push notifications (FCM token)',
        body: z.object({ token: z.string().min(20).max(4096) }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { deviceId } = userAuth(req);
      await deps.prisma.device.update({
        where: { id: deviceId },
        data: { pushTokenEnc: deps.cipher.encrypt(req.body.token, pushTokenContext(deviceId)), lastSeenAt: new Date() },
      });
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/v1/devices/:id',
    {
      schema: {
        tags: ['devices'],
        security: [{ bearer: [] }],
        summary: 'Remove a phone from the account (signs it out everywhere)',
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId, deviceId } = userAuth(req);
      const target = await deps.prisma.device.findFirst({ where: { id: req.params.id, userId, revokedAt: null } });
      if (!target) throw new AppError('NOT_FOUND');
      await services.devices.revoke([target.id], userId, target.id === deviceId ? 'self_removed' : 'removed_by_user', {
        actorType: 'user',
        actorId: userId,
      });
      return reply.status(204).send(null);
    },
  );
}
