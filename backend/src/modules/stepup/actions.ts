import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Deps } from '../../deps.js';
import type { Lang } from '../../generated/catalog.js';
import { AppError } from '../../lib/errors.js';
import { randomDigits } from '../../lib/crypto.js';
import type { Services } from '../../services.js';
import type { AuditInput } from '../audit/audit.service.js';
import { RECOVERY_CODE_COUNT, generateRecoveryCode, recoveryCodeHash } from '../recovery/codes.js';
import { ctxUserEmail, ctxUserName, ctxUserPhone } from '../users/users.service.js';

export type SensitiveActionKey =
  | 'add_device'
  | 'add_passkey'
  | 'remove_guardian'
  | 'change_phone'
  | 'change_email'
  | 'view_recovery_codes'
  | 'delete_account';

export interface ExecContext {
  userId: string;
  deviceId: string;
  stepupId: string;
  tx: Prisma.TransactionClient;
  log: (i: AuditInput) => Promise<unknown>;
  /** Work to run after the transaction commits (notifications, cache updates). */
  after: (fn: () => Promise<void> | void) => void;
}

export interface ActionDef<P> {
  params: z.ZodType<P>;
  /** Validate against current state before asking anyone to approve. Returns normalised params. */
  precheck: (userId: string, params: P) => Promise<P>;
  /** One line shown to guardians (e.g. the guardian being removed). Never shows secrets. */
  summary: (params: P, lang: Lang) => Promise<string | null>;
  execute: (c: ExecContext, params: P) => Promise<Record<string, unknown>>;
  /** Results that must be shown once and then forgotten (e.g. recovery codes). */
  oneTimeResult?: boolean;
}

export const DEVICE_LINK_TTL_SECONDS = 600;
export const deviceLinkKey = (codeHash: string) => `devlink:${codeHash}`;

export function createActions(deps: Deps, services: Services) {
  const { prisma, cipher, blind } = deps;

  const remove_guardian: ActionDef<{ linkId: string }> = {
    params: z.object({ linkId: z.uuid() }),
    async precheck(userId, p) {
      const link = await prisma.guardianLink.findFirst({ where: { id: p.linkId, userId, status: 'active' } });
      if (!link) throw new AppError('NOT_FOUND');
      return p;
    },
    async summary(p) {
      const link = await prisma.guardianLink.findUnique({ where: { id: p.linkId }, include: { guardian: true } });
      return link ? services.users.displayName(link.guardian) : null;
    },
    async execute(c, p) {
      const link = await services.guardians.scheduleRemoval(c.tx, c.log, p.linkId, c.userId);
      c.after(() => services.guardians.alertChange(link, 'guardian_removed'));
      return { linkId: link.id, removesAt: link.removesAt!.toISOString() };
    },
  };

  const change_phone: ActionDef<{ phone: string }> = {
    params: z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }),
    async precheck(userId, p) {
      const other = await prisma.user.findUnique({ where: { phoneHash: blind.of('phone', p.phone) } });
      if (other && other.id !== userId) throw new AppError('INVALID_INPUT', {}, { fields: ['phone'] });
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c, p) {
      await c.tx.user.update({
        where: { id: c.userId },
        data: { phoneEnc: cipher.encrypt(p.phone, ctxUserPhone(c.userId)), phoneHash: blind.of('phone', p.phone), phoneVerifiedAt: null },
      });
      await c.log({ actorType: 'user', actorId: c.userId, action: 'account.phone_changed', subjectType: 'user', subjectId: c.userId });
      let verificationSent = false;
      if (deps.sms.enabled) {
        c.after(async () => {
          await services.phone.sendVerification(c.userId, p.phone);
        });
        verificationSent = true;
      }
      return { verificationSent };
    },
  };

  const change_email: ActionDef<{ email: string }> = {
    params: z.object({ email: z.email().max(254).transform((e) => e.trim().toLowerCase()) }),
    async precheck(userId, p) {
      const other = await prisma.user.findUnique({ where: { emailHash: blind.of('email', p.email) } });
      if (other && other.id !== userId) throw new AppError('INVALID_INPUT', {}, { fields: ['email'] });
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c, p) {
      await c.tx.user.update({
        where: { id: c.userId },
        data: { emailEnc: cipher.encrypt(p.email, ctxUserEmail(c.userId)), emailHash: blind.of('email', p.email) },
      });
      await c.log({ actorType: 'user', actorId: c.userId, action: 'account.email_changed', subjectType: 'user', subjectId: c.userId });
      return {};
    },
  };

  const add_passkey: ActionDef<Record<string, never>> = {
    params: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
    async precheck(_u, p) {
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c) {
      const user = await c.tx.user.findUniqueOrThrow({ where: { id: c.userId }, include: { credentials: { where: { revokedAt: null } } } });
      const options = await services.webauthn.registrationOptions({
        userId: user.webauthnUserId,
        userName: user.handle,
        displayName: cipher.decrypt(user.displayNameEnc, ctxUserName(user.id)),
        exclude: user.credentials.map((cr) => ({ id: cr.id, transports: cr.transports })),
      });
      await services.webauthn.storeChallenge(options.challenge, { purpose: 'user_add_passkey', userId: c.userId, deviceId: c.deviceId, stepupId: c.stepupId }, 600);
      return { registrationOptions: options };
    },
    oneTimeResult: true,
  };

  const add_device: ActionDef<Record<string, never>> = {
    params: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
    async precheck(_u, p) {
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c) {
      const code = randomDigits(8);
      const linkId = crypto.randomUUID();
      await deps.redis.set(deviceLinkKey(blind.of('device-link', code)), JSON.stringify({ userId: c.userId, linkId, stepupId: c.stepupId }), 'EX', DEVICE_LINK_TTL_SECONDS);
      await c.log({ actorType: 'user', actorId: c.userId, action: 'device.link_code_created', subjectType: 'user', subjectId: c.userId, payload: { linkId } });
      return { code, expiresAt: new Date(Date.now() + DEVICE_LINK_TTL_SECONDS * 1000).toISOString() };
    },
    oneTimeResult: true,
  };

  const view_recovery_codes: ActionDef<Record<string, never>> = {
    params: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
    async precheck(_u, p) {
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c) {
      // Codes are stored hashed, so "viewing" means issuing a fresh set and invalidating the old one.
      const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      await c.tx.recoveryCode.deleteMany({ where: { userId: c.userId } });
      await c.tx.recoveryCode.createMany({ data: codes.map((code) => ({ userId: c.userId, codeHash: recoveryCodeHash(blind, code) })) });
      await c.log({ actorType: 'user', actorId: c.userId, action: 'recovery.codes_issued', subjectType: 'user', subjectId: c.userId, payload: { count: codes.length } });
      return { codes };
    },
    oneTimeResult: true,
  };

  const delete_account: ActionDef<Record<string, never>> = {
    params: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
    async precheck(_u, p) {
      return p;
    },
    async summary() {
      return null;
    },
    async execute(c) {
      const devices = await services.privacy.deleteAccount(c.tx, c.log, c.userId);
      c.after(() => services.devices.afterRevoke(devices, c.userId, 'account_deleted'));
      return { deleted: true };
    },
  };

  const actions: Record<SensitiveActionKey, ActionDef<never>> = {
    add_device,
    add_passkey,
    remove_guardian,
    change_phone,
    change_email,
    view_recovery_codes,
    delete_account,
  } as unknown as Record<SensitiveActionKey, ActionDef<never>>;
  return actions;
}

export type Actions = ReturnType<typeof createActions>;

/** BigInt-safe JSON for storing params and results. */
export function toStorable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

export const SENSITIVE_ACTIONS = [
  'add_device',
  'add_passkey',
  'remove_guardian',
  'change_phone',
  'change_email',
  'view_recovery_codes',
  'delete_account',
] as const satisfies readonly SensitiveActionKey[];

