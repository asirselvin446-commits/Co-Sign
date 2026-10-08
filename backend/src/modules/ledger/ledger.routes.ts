import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { accountLimit } from '../../http/context.js';
import { userAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { ctxTransferMemo } from './ledger.service.js';

const money = z.string().describe('Amount in minor units (1/100), as a decimal string');

export async function ledgerRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { ledger, users } = services;

  app.get(
    '/v1/account',
    {
      schema: {
        tags: ['ledger'],
        security: [{ bearer: [] }],
        response: {
          200: z.object({
            currency: z.string(),
            balanceMinor: money,
            transferLimitMinor: money,
            usedTodayMinor: money,
            remainingTodayMinor: money,
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const s = await ledger.summary(userId);
      return {
        currency: s.account.currency,
        balanceMinor: s.account.balanceMinor.toString(),
        transferLimitMinor: s.account.transferLimitMinor.toString(),
        usedTodayMinor: s.usedTodayMinor.toString(),
        remainingTodayMinor: s.remainingTodayMinor.toString(),
      };
    },
  );

  app.get(
    '/v1/account/activity',
    {
      schema: {
        tags: ['ledger'],
        security: [{ bearer: [] }],
        querystring: z.object({ before: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                direction: z.enum(['in', 'out']),
                amountMinor: money,
                currency: z.string(),
                counterparty: z.object({ handle: z.string(), displayName: z.string() }),
                memo: z.string().nullable(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const { account } = await ledger.summary(userId);
      const rows = await deps.prisma.transfer.findMany({
        where: {
          OR: [{ fromAccountId: account.id }, { toAccountId: account.id }],
          ...(req.query.before ? { createdAt: { lt: new Date(req.query.before) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: req.query.limit,
        include: { fromAccount: { include: { user: true } }, toAccount: { include: { user: true } } },
      });
      return {
        items: rows.map((t) => {
          const out = t.fromAccountId === account.id;
          const other = out ? t.toAccount.user : t.fromAccount.user;
          return {
            id: t.id,
            direction: out ? ('out' as const) : ('in' as const),
            amountMinor: t.amountMinor.toString(),
            currency: t.currency,
            counterparty: { handle: other.status === 'active' ? other.handle : 'deleted', displayName: other.status === 'active' ? users.displayName(other) : '' },
            memo: t.memoEnc ? deps.cipher.decrypt(t.memoEnc, ctxTransferMemo(t.id)) : null,
            createdAt: t.createdAt.toISOString(),
          };
        }),
      };
    },
  );

  app.get(
    '/v1/payees',
    {
      schema: {
        tags: ['ledger'],
        security: [{ bearer: [] }],
        response: { 200: z.object({ payees: z.array(z.object({ id: z.string(), nickname: z.string(), handle: z.string(), displayName: z.string(), createdAt: z.string() })) }) },
      },
      preHandler: guards.requireUser,
    },
    async (req) => {
      const { userId } = userAuth(req);
      const payees = await deps.prisma.payee.findMany({ where: { ownerId: userId, removedAt: null }, include: { payeeUser: true }, orderBy: { nickname: 'asc' } });
      return {
        payees: payees
          .filter((p) => p.payeeUser.status === 'active')
          .map((p) => ({ id: p.id, nickname: p.nickname, handle: p.payeeUser.handle, displayName: users.displayName(p.payeeUser), createdAt: p.createdAt.toISOString() })),
      };
    },
  );

  app.delete(
    '/v1/payees/:id',
    {
      schema: { tags: ['ledger'], security: [{ bearer: [] }], params: z.object({ id: z.uuid() }), response: { 204: z.null() } },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      await deps.audit.transaction(async (tx, log) => {
        const r = await tx.payee.updateMany({ where: { id: req.params.id, ownerId: userId, removedAt: null }, data: { removedAt: new Date() } });
        if (r.count !== 1) throw new AppError('NOT_FOUND');
        await log({ actorType: 'user', actorId: userId, action: 'ledger.payee_removed', subjectType: 'payee', subjectId: req.params.id });
      });
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/v1/transfers',
    {
      schema: {
        tags: ['ledger'],
        security: [{ bearer: [] }],
        summary: 'Send money to a payee within the daily limit (above it, start a transfer_above_limit step-up)',
        headers: z.object({ 'idempotency-key': z.string().min(8).max(80) }),
        body: z.object({
          payeeId: z.uuid(),
          amountMinor: z.string().regex(/^[1-9]\d{0,14}$/),
          memo: z.string().trim().max(140).optional(),
        }),
        response: { 200: z.object({ transferId: z.string(), replayed: z.boolean(), balanceMinor: money }) },
      },
      preHandler: guards.requireUser,
      config: accountLimit(30, '1 minute'),
    },
    async (req) => {
      const { userId } = userAuth(req);
      const open = await deps.prisma.recovery.findFirst({ where: { userId, status: { in: ['pending_approvals', 'cancel_window', 'ready'] } } });
      if (open) throw new AppError('RECOVERY_PENDING', {}, { recoveryId: open.id });
      const { transfer, replayed } = await ledger.transfer(
        {
          userId,
          payeeId: req.body.payeeId,
          amountMinor: BigInt(req.body.amountMinor),
          memo: req.body.memo,
          idempotencyKey: req.headers['idempotency-key'],
        },
        { allowAboveLimit: false },
      );
      const { account } = await ledger.summary(userId);
      deps.realtime.toUser(userId, 'account.updated', {});
      const to = await deps.prisma.account.findUnique({ where: { id: transfer.toAccountId } });
      if (to) deps.realtime.toUser(to.userId, 'account.updated', {});
      return { transferId: transfer.id, replayed, balanceMinor: account.balanceMinor.toString() };
    },
  );

  app.post(
    '/v1/account/limit/lower',
    {
      schema: {
        tags: ['ledger'],
        security: [{ bearer: [] }],
        summary: 'Lower the daily transfer limit (raising it is a sensitive action)',
        body: z.object({ newLimitMinor: z.string().regex(/^\d{1,15}$/) }),
        response: { 204: z.null() },
      },
      preHandler: guards.requireUser,
    },
    async (req, reply) => {
      const { userId } = userAuth(req);
      const next = BigInt(req.body.newLimitMinor);
      await deps.audit.transaction(async (tx, log) => {
        const r = await tx.account.updateMany({ where: { userId, transferLimitMinor: { gte: next } }, data: { transferLimitMinor: next } });
        if (r.count !== 1) throw new AppError('INVALID_INPUT', {}, { fields: ['newLimitMinor'] });
        await log({ actorType: 'user', actorId: userId, action: 'ledger.limit_lowered', subjectType: 'user', subjectId: userId, payload: { newLimitMinor: next.toString() } });
      });
      return reply.status(204).send(null);
    },
  );
}
