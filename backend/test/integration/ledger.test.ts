import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { call, registerUser, type TestUser } from '../helpers/client.js';
import { addPayee, ageDevice, grantConsent } from '../helpers/flows.js';

describe('ledger: balances, payees and transfers', () => {
  let t: TestApp;
  let alice: TestUser;
  let bob: TestUser;
  let payeeId: string;

  beforeAll(async () => {
    t = await startTestApp();
    alice = await registerUser(t, 'alice');
    bob = await registerUser(t, 'bob');
    for (const u of [alice, bob]) {
      await grantConsent(t, u);
      await ageDevice(t, u);
    }
    payeeId = await addPayee(t, alice, 'bob', 'Bob');
  });
  afterAll(async () => {
    await t.close();
  });

  const send = (amountMinor: string, key = randomUUID(), payee = payeeId, token = alice.accessToken) =>
    call(t, 'POST', '/v1/transfers', { token, headers: { 'idempotency-key': key }, body: { payeeId: payee, amountMinor } });

  it('seeds new accounts with the configured starting balance and limit', async () => {
    const acc = await call(t, 'GET', '/v1/account', { token: alice.accessToken });
    expect(acc.body).toMatchObject({ currency: 'XTS', balanceMinor: '5000000', transferLimitMinor: '1000000', usedTodayMinor: '0' });
  });

  it('adding a payee is a sensitive action and lists the payee afterwards', async () => {
    const list = await call(t, 'GET', '/v1/payees', { token: alice.accessToken });
    expect(list.body.payees).toEqual([expect.objectContaining({ id: payeeId, handle: 'bob', nickname: 'Bob' })]);
  });

  it('moves money atomically and shows it in both activity feeds', async () => {
    const r = await send('12345');
    expect(r.status).toBe(200);
    expect(r.body.balanceMinor).toBe(String(5_000_000 - 12_345));
    const bobAcc = await call(t, 'GET', '/v1/account', { token: bob.accessToken });
    expect(bobAcc.body.balanceMinor).toBe(String(5_000_000 + 12_345));
    const act = await call(t, 'GET', '/v1/account/activity', { token: bob.accessToken });
    expect(act.body.items[0]).toMatchObject({ direction: 'in', amountMinor: '12345', counterparty: { handle: 'alice' } });
  });

  it('is idempotent: the same key and request returns the original transfer once', async () => {
    const key = randomUUID();
    const a = await send('100', key);
    const b = await send('100', key);
    expect(b.body.transferId).toBe(a.body.transferId);
    expect(b.body.replayed).toBe(true);
    expect(await t.deps.prisma.transfer.count({ where: { idempotencyKey: key } })).toBe(1);
    const conflict = await send('101', key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('handles concurrent duplicate submissions without double spending', async () => {
    const key = randomUUID();
    const before = (await call(t, 'GET', '/v1/account', { token: alice.accessToken })).body.balanceMinor;
    const results = await Promise.all(Array.from({ length: 5 }, () => send('200', key)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.transferId)).size).toBe(1);
    const after = (await call(t, 'GET', '/v1/account', { token: alice.accessToken })).body.balanceMinor;
    expect(BigInt(before) - BigInt(after)).toBe(200n);
  });

  it('never overspends under concurrent different transfers', async () => {
    const carol = await registerUser(t, 'carol');
    await grantConsent(t, carol);
    await ageDevice(t, carol);
    await t.deps.prisma.account.update({ where: { userId: carol.id }, data: { balanceMinor: 1000n, transferLimitMinor: 100_000n } });
    const p = await addPayee(t, carol, 'bob');
    const results = await Promise.all(Array.from({ length: 6 }, () => send('300', randomUUID(), p, carol.accessToken)));
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(3);
    expect(results.filter((r) => r.status !== 200).every((r) => r.body.error.code === 'INSUFFICIENT_FUNDS')).toBe(true);
    const acc = await t.deps.prisma.account.findUniqueOrThrow({ where: { userId: carol.id } });
    expect(acc.balanceMinor).toBe(100n);
  });

  it('refuses transfers above the rolling daily limit and asks for a step-up instead', async () => {
    const r = await send('1000001');
    expect(r.status).toBe(428);
    expect(r.body.error.code).toBe('LIMIT_STEPUP_REQUIRED');
    expect(r.body.error.action).toBe('transfer_above_limit');
  });

  it('rejects payees that are not yours', async () => {
    const r = await send('10', randomUUID(), payeeId, bob.accessToken);
    expect(r.status).toBe(404);
  });

  it('lets the user lower (but not raise) the limit without a step-up', async () => {
    const low = await call(t, 'POST', '/v1/account/limit/lower', { token: bob.accessToken, body: { newLimitMinor: '500000' } });
    expect(low.status).toBe(204);
    const high = await call(t, 'POST', '/v1/account/limit/lower', { token: bob.accessToken, body: { newLimitMinor: '900000' } });
    expect(high.status).toBe(400);
  });

  it('keeps the sum of all balances constant (money is only moved, never created)', async () => {
    const users = await t.deps.prisma.user.count();
    const agg = await t.deps.prisma.account.aggregate({ _sum: { balanceMinor: true } });
    // carol's balance was set by hand above: 5,000,000 -> 1,000.
    expect(agg._sum.balanceMinor).toBe(BigInt(users) * 5_000_000n - (5_000_000n - 1000n));
  });
});
