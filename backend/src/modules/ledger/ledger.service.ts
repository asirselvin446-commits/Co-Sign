import type { Prisma, Transfer } from '@prisma/client';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import type { AuditInput } from '../audit/audit.service.js';

export const ctxTransferMemo = (id: string) => `transfer.memo:${id}`;
const DAY_MS = 24 * 3600 * 1000;

/** True when sending `amount` now would take the rolling 24-hour total over the limit. */
export function exceedsDailyLimit(usedLast24h: bigint, amount: bigint, limit: bigint): boolean {
  return usedLast24h + amount > limit;
}

export interface TransferInput {
  userId: string;
  payeeId: string;
  amountMinor: bigint;
  memo?: string | undefined;
  idempotencyKey: string;
  stepupRequestId?: string | null;
}


export class LedgerService {
  constructor(private readonly deps: Deps) {}

  /** Total sent in the last 24 hours (rolling window). */
  async sentInLastDay(tx: Prisma.TransactionClient, accountId: string): Promise<bigint> {
    const agg = await tx.transfer.aggregate({
      where: { fromAccountId: accountId, status: 'completed', createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      _sum: { amountMinor: true },
    });
    return agg._sum.amountMinor ?? 0n;
  }

  async summary(userId: string) {
    const account = await this.deps.prisma.account.findUnique({ where: { userId } });
    if (!account) throw new AppError('NOT_FOUND');
    const used = await this.sentInLastDay(this.deps.prisma, account.id);
    const remaining = account.transferLimitMinor > used ? account.transferLimitMinor - used : 0n;
    return { account, usedTodayMinor: used, remainingTodayMinor: remaining };
  }

  async resolvePayee(userId: string, payeeId: string) {
    const payee = await this.deps.prisma.payee.findFirst({
      where: { id: payeeId, ownerId: userId, removedAt: null },
      include: { payeeUser: { include: { account: true } } },
    });
    if (!payee || payee.payeeUser.status !== 'active' || !payee.payeeUser.account) throw new AppError('NOT_FOUND');
    return payee;
  }

  /**
   * Move money between two platform accounts, atomically:
   *  - the idempotency key makes retries safe (same key + same request returns the original transfer);
   *  - the sender row is locked, so concurrent transfers cannot overspend;
   *  - the daily limit is enforced unless a completed step-up authorised going over it;
   *  - balances can never go negative (also enforced by a CHECK constraint).
   */
  async transfer(
    input: TransferInput,
    opts: { allowAboveLimit: boolean; tx?: Prisma.TransactionClient; log?: (i: AuditInput) => Promise<unknown> },
  ): Promise<{ transfer: Transfer; replayed: boolean }> {
    if (input.amountMinor <= 0n) throw new AppError('INVALID_INPUT', {}, { fields: ['amountMinor'] });
    const run = async (tx: Prisma.TransactionClient, log: (i: AuditInput) => Promise<unknown>) => {
      const existing = await tx.transfer.findUnique({
        where: { initiatedById_idempotencyKey: { initiatedById: input.userId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        const same =
          existing.amountMinor === input.amountMinor &&
          (await tx.payee.findFirst({ where: { id: input.payeeId, ownerId: input.userId } }))?.payeeUserId ===
            (await tx.account.findUnique({ where: { id: existing.toAccountId } }))?.userId;
        if (!same) throw new AppError('IDEMPOTENCY_CONFLICT');
        return { transfer: existing, replayed: true };
      }

      const payee = await tx.payee.findFirst({
        where: { id: input.payeeId, ownerId: input.userId, removedAt: null },
        include: { payeeUser: { include: { account: true } } },
      });
      if (!payee?.payeeUser.account || payee.payeeUser.status !== 'active') throw new AppError('NOT_FOUND');

      const [from] = await tx.$queryRaw<Array<{ id: string; balance_minor: bigint; transfer_limit_minor: bigint; currency: string }>>`
        SELECT id, balance_minor, transfer_limit_minor, currency FROM accounts WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
      if (!from) throw new AppError('NOT_FOUND');
      const to = payee.payeeUser.account;
      if (to.currency !== from.currency) throw new AppError('INVALID_INPUT', {}, { fields: ['currency'] });

      if (!opts.allowAboveLimit) {
        const used = await this.sentInLastDay(tx, from.id);
        if (exceedsDailyLimit(used, input.amountMinor, from.transfer_limit_minor)) {
          throw new AppError('LIMIT_STEPUP_REQUIRED', {}, { action: 'transfer_above_limit' });
        }
      }
      if (from.balance_minor < input.amountMinor) throw new AppError('INSUFFICIENT_FUNDS');

      await tx.$executeRaw`UPDATE accounts SET balance_minor = balance_minor - ${input.amountMinor}, updated_at = now() WHERE id = ${from.id}::uuid`;
      await tx.$executeRaw`UPDATE accounts SET balance_minor = balance_minor + ${input.amountMinor}, updated_at = now() WHERE id = ${to.id}::uuid`;
      const id = crypto.randomUUID();
      const transfer = await tx.transfer.create({
        data: {
          id,
          fromAccountId: from.id,
          toAccountId: to.id,
          amountMinor: input.amountMinor,
          currency: from.currency,
          memoEnc: input.memo ? this.deps.cipher.encrypt(input.memo, ctxTransferMemo(id)) : null,
          status: 'completed',
          idempotencyKey: input.idempotencyKey,
          initiatedById: input.userId,
          stepupRequestId: input.stepupRequestId ?? null,
        },
      });
      await log({
        actorType: 'user',
        actorId: input.userId,
        action: 'ledger.transfer',
        subjectType: 'transfer',
        subjectId: transfer.id,
        payload: { amountMinor: input.amountMinor.toString(), currency: from.currency, toUserId: payee.payeeUserId, stepupRequestId: input.stepupRequestId ?? null },
      });
      return { transfer, replayed: false };
    };

    if (opts.tx && opts.log) return run(opts.tx, opts.log);
    try {
      return await this.deps.audit.transaction(run);
    } catch (e) {
      // Two identical requests raced on the idempotency key: return the winner's result.
      if ((e as { code?: string }).code === 'P2002') {
        const winner = await this.deps.prisma.transfer.findUnique({
          where: { initiatedById_idempotencyKey: { initiatedById: input.userId, idempotencyKey: input.idempotencyKey } },
        });
        if (winner && winner.amountMinor === input.amountMinor) return { transfer: winner, replayed: true };
        throw new AppError('IDEMPOTENCY_CONFLICT');
      }
      throw e;
    }
  }
}
