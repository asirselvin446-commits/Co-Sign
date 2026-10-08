import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Ctx, ZApp } from '../../http/context.js';
import { adminAuth } from '../../http/auth.js';
import { AppError } from '../../lib/errors.js';
import { ruleSetSchema, type RuleConfig } from '../risk/engine.js';

/** Audit actions behind each dashboard counter. */
export const METRIC_ACTIONS = {
  logins: ['auth.login', 'auth.login_new_device'],
  loginFailures: ['auth.login_failed'],
  passkeyFailures: ['auth.assertion_failed'],
  refreshReuse: ['auth.refresh_reuse_detected'],
  staffLoginFailures: ['admin.login_failed'],
  stepups: ['stepup.created'],
  guardianWaits: ['stepup.awaiting_guardians'],
  approvals: ['stepup.guardian_approved'],
  denials: ['stepup.guardian_denied'],
  cooloffs: ['stepup.cooloff_started'],
  stepupsCompleted: ['stepup.completed'],
  recoveriesStarted: ['recovery.started'],
  recoveriesCancelled: ['recovery.cancelled', 'recovery.guardian_denied'],
  recoveriesCompleted: ['recovery.completed'],
  monitorAlerts: ['monitor.alert', 'monitor.pause_started'],
  pauses: ['monitor.pause_started'],
  pausesReleased: ['monitor.pause_released'],
} as const;
export type MetricKey = keyof typeof METRIC_ACTIONS;

const range = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

function window(q: { from?: string | undefined; to?: string | undefined }, defaultDays = 7) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - defaultDays * 24 * 3600 * 1000);
  if (from >= to || to.getTime() - from.getTime() > 366 * 24 * 3600 * 1000) throw new AppError('INVALID_INPUT', {}, { fields: ['from', 'to'] });
  return { from, to };
}

/** Byte-order mark so spreadsheet apps read the CSV as UTF-8 (Tamil and Hindi text). */
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  // Quote everything; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function adminRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { prisma, audit } = deps;
  const anyStaff = guards.requireAdmin();
  const adminOnly = guards.requireAdmin(['admin']);
  const tag = { tags: ['admin'], security: [{ bearer: [] }] };

  // ---------------------------------------------------------------- metrics

  app.get(
    '/v1/admin/metrics',
    {
      schema: {
        ...tag,
        summary: 'Counters for the overview (from audit events) and median guardian response time. Buckets are UTC.',
        querystring: range,
        response: {
          200: z.object({
            from: z.string(),
            to: z.string(),
            counters: z.record(z.string(), z.number()),
            failuresByType: z.record(z.string(), z.number()),
            medianGuardianResponseMs: z.number().nullable(),
          }),
        },
      },
      preHandler: anyStaff,
    },
    async (req) => {
      const { from, to } = window(req.query);
      const rows = await prisma.auditEvent.groupBy({
        by: ['action'],
        where: { createdAt: { gte: from, lt: to } },
        _count: { _all: true },
      });
      const byAction = new Map(rows.map((r) => [r.action, r._count._all]));
      const counters = Object.fromEntries(
        (Object.keys(METRIC_ACTIONS) as MetricKey[]).map((k) => [k, METRIC_ACTIONS[k].reduce((n, a) => n + (byAction.get(a) ?? 0), 0)]),
      );
      const failureRows = await prisma.$queryRaw<Array<{ reason: string | null; n: bigint }>>`
        SELECT payload->>'reason' AS reason, count(*) AS n FROM audit_events
        WHERE action = 'auth.login_failed' AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1`;
      const failuresByType: Record<string, number> = {
        passkey_rejected: byAction.get('auth.assertion_failed') ?? 0,
        refresh_token_reuse: byAction.get('auth.refresh_reuse_detected') ?? 0,
        staff_sign_in: byAction.get('admin.login_failed') ?? 0,
      };
      for (const r of failureRows) failuresByType[`sign_in_${(r.reason ?? 'unknown').toLowerCase().replace(/^sign_in_/, '')}`] = Number(r.n);
      const [median] = await prisma.$queryRaw<Array<{ p50: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms) AS p50
        FROM guardian_decisions WHERE created_at >= ${from} AND created_at < ${to}`;
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        counters,
        failuresByType,
        medianGuardianResponseMs: median?.p50 === null || median?.p50 === undefined ? null : Math.round(Number(median.p50)),
      };
    },
  );

  app.get(
    '/v1/admin/metrics/timeseries',
    {
      schema: {
        ...tag,
        querystring: range.extend({ bucket: z.enum(['hour', 'day']).default('hour') }),
        response: {
          200: z.object({
            bucket: z.enum(['hour', 'day']),
            series: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
          }),
        },
      },
      preHandler: anyStaff,
    },
    async (req) => {
      const { from, to } = window(req.query, req.query.bucket === 'hour' ? 2 : 30);
      const bucket = req.query.bucket;
      const keys: MetricKey[] = ['logins', 'loginFailures', 'stepups', 'approvals', 'denials', 'cooloffs', 'recoveriesStarted', 'monitorAlerts'];
      const actions = keys.flatMap((k) => [...METRIC_ACTIONS[k]]);
      const rows = await prisma.$queryRaw<Array<{ t: Date; action: string; n: bigint }>>`
        SELECT date_trunc(${bucket}, created_at AT TIME ZONE 'UTC') AS t, action, count(*) AS n FROM audit_events
        WHERE created_at >= ${from} AND created_at < ${to} AND action IN (${Prisma.join(actions)})
        GROUP BY 1, 2 ORDER BY 1`;
      const step = bucket === 'hour' ? 3600_000 : 86_400_000;
      const start = Math.floor(from.getTime() / step) * step;
      const points = new Map<number, Record<string, number>>();
      for (let t = start; t < to.getTime(); t += step) points.set(t, Object.fromEntries(keys.map((k) => [k, 0])));
      for (const r of rows) {
        const p = points.get(new Date(r.t).getTime());
        const key = keys.find((k) => (METRIC_ACTIONS[k] as readonly string[]).includes(r.action));
        if (p && key) p[key] = (p[key] ?? 0) + Number(r.n);
      }
      return { bucket, series: [...points.entries()].map(([t, v]) => ({ t: new Date(t).toISOString(), ...v })) };
    },
  );

  // ---------------------------------------------------------------- user lookup

  app.get(
    '/v1/admin/users',
    {
      schema: {
        ...tag,
        summary: 'Find accounts by handle prefix',
        querystring: z.object({ q: z.string().trim().toLowerCase().min(2).max(40) }),
        response: {
          200: z.object({
            users: z.array(z.object({ id: z.string(), handle: z.string(), displayName: z.string(), status: z.string(), createdAt: z.string() })),
          }),
        },
      },
      preHandler: anyStaff,
    },
    async (req) => {
      const q = req.query.q.replace(/^@/, '');
      const users = await prisma.user.findMany({ where: { handle: { startsWith: q } }, orderBy: { handle: 'asc' }, take: 25 });
      return {
        users: users.map((u) => ({ id: u.id, handle: u.handle, displayName: services.users.displayName(u), status: u.status, createdAt: u.createdAt.toISOString() })),
      };
    },
  );

  app.get(
    '/v1/admin/users/:id',
    {
      schema: {
        ...tag,
        summary: 'Account security view: devices, passkeys, guardians, safety checks and recent audit events.',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.record(z.string(), z.unknown()) },
      },
      preHandler: anyStaff,
    },
    async (req) => {
      const { adminId, role } = adminAuth(req);
      const u = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          devices: { orderBy: { enrolledAt: 'asc' } },
          guardianLinks: { include: { guardian: { select: { handle: true } } }, where: { status: { in: ['pending_activation', 'active', 'pending_removal'] } } },
          guardingLinks: { include: { user: { select: { handle: true } } }, where: { status: { in: ['pending_activation', 'active', 'pending_removal'] } } },
          stepupRequests: { orderBy: { createdAt: 'desc' }, take: 20 },
          recoveries: { orderBy: { createdAt: 'desc' }, take: 5 },
          credentials: { select: { id: true, createdAt: true, lastUsedAt: true, backedUp: true, revokedAt: true } },
        },
      });
      if (!u) throw new AppError('NOT_FOUND');
      // Insider-threat control: every look at a person's account is itself audited.
      await audit.append({ actorType: 'admin', actorId: adminId, action: 'admin.user_viewed', subjectType: 'user', subjectId: u.id, payload: { role } });
      const events = await prisma.auditEvent.findMany({
        where: { OR: [{ subjectId: u.id }, { actorId: u.id }] },
        orderBy: { id: 'desc' },
        take: 50,
      });
      return {
        id: u.id,
        handle: u.handle,
        displayName: services.users.displayName(u),
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        phoneVerified: u.phoneVerifiedAt !== null,
        devices: u.devices.map((d) => ({
          id: d.id,
          platform: d.platform,
          enrolledAt: d.enrolledAt.toISOString(),
          lastSeenAt: d.lastSeenAt.toISOString(),
          revokedAt: d.revokedAt?.toISOString() ?? null,
          integrity: d.integrityVerdict,
          simChangedAt: d.simChangedAt?.toISOString() ?? null,
          push: d.pushTokenEnc !== null,
        })),
        passkeys: u.credentials.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), lastUsedAt: c.lastUsedAt?.toISOString() ?? null, revokedAt: c.revokedAt?.toISOString() ?? null })),
        guardians: u.guardianLinks.map((l) => ({ handle: l.guardian.handle, status: l.status })),
        guarding: u.guardingLinks.map((l) => ({ handle: l.user.handle, status: l.status })),
        stepups: u.stepupRequests.map((s) => ({
          id: s.id,
          action: s.action,
          status: s.status,
          score: s.score,
          rules: (s.reasons as unknown as Array<{ key: string }>).map((r) => r.key),
          createdAt: s.createdAt.toISOString(),
        })),
        recoveries: u.recoveries.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt.toISOString() })),
        events: events.map((e) => ({ id: e.id.toString(), createdAt: e.createdAt.toISOString(), action: e.action, actorType: e.actorType })),
      };
    },
  );

  // ---------------------------------------------------------------- risk rules

  const ruleView = z.object({
    version: z.number(),
    guardianThreshold: z.number(),
    rules: z.array(
      z.object({
        key: z.string(),
        weight: z.number(),
        enabled: z.boolean(),
        reasons: z.object({ en: z.string(), ta: z.string(), hi: z.string() }),
      }),
    ),
  });

  app.get(
    '/v1/admin/risk/rules',
    {
      schema: {
        ...tag,
        response: {
          200: z.object({
            active: ruleView,
            versions: z.array(z.object({ version: z.number(), createdAt: z.string(), createdBy: z.string().nullable(), note: z.string().nullable() })),
          }),
        },
      },
      preHandler: anyStaff,
    },
    async () => {
      const active = await services.risk.activeRuleSet();
      const versions = await prisma.riskRuleSet.findMany({ orderBy: { version: 'desc' }, take: 50, include: { createdBy: { select: { handle: true } } } });
      return {
        active,
        versions: versions.map((v) => ({ version: v.version, createdAt: v.createdAt.toISOString(), createdBy: v.createdBy?.handle ?? null, note: v.note })),
      };
    },
  );

  app.get(
    '/v1/admin/risk/rules/:version',
    { schema: { ...tag, params: z.object({ version: z.coerce.number().int().positive() }), response: { 200: ruleView } }, preHandler: anyStaff },
    async (req) => {
      const v = await prisma.riskRuleSet.findUnique({ where: { version: req.params.version } });
      if (!v) throw new AppError('NOT_FOUND');
      return { version: v.version, guardianThreshold: v.guardianThreshold, rules: v.rules as unknown as RuleConfig[] };
    },
  );

  app.post(
    '/v1/admin/risk/rules',
    {
      schema: {
        ...tag,
        summary: 'Publish a new rule-set version (weights, enabled flags, reasons, threshold). Audited.',
        body: ruleSetSchema.and(z.object({ note: z.string().trim().max(200).optional() })),
        response: { 200: ruleView },
      },
      preHandler: adminOnly,
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const published = await services.risk.publishRuleSet(adminId, req.body as { guardianThreshold: number; rules: RuleConfig[]; note?: string });
      return published;
    },
  );

  // ---------------------------------------------------------------- audit log

  const auditRow = z.object({
    id: z.string(),
    createdAt: z.string(),
    actorType: z.string(),
    actorId: z.string().nullable(),
    action: z.string(),
    subjectType: z.string().nullable(),
    subjectId: z.string().nullable(),
    payload: z.unknown(),
    prevHash: z.string(),
    hash: z.string(),
  });
  const auditQuery = range.extend({
    action: z.string().max(80).optional(),
    subjectId: z.string().max(80).optional(),
    before: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  const auditWhere = (q: z.infer<typeof auditQuery>): Prisma.AuditEventWhereInput => ({
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.subjectId ? { OR: [{ subjectId: q.subjectId }, { actorId: q.subjectId }] } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
  });

  app.get(
    '/v1/admin/audit',
    {
      schema: { ...tag, querystring: auditQuery, response: { 200: z.object({ events: z.array(auditRow), nextBefore: z.string().nullable() }) } },
      preHandler: anyStaff,
    },
    async (req) => {
      const rows = await prisma.auditEvent.findMany({
        where: { ...auditWhere(req.query), ...(req.query.before ? { id: { lt: BigInt(req.query.before) } } : {}) },
        orderBy: { id: 'desc' },
        take: req.query.limit,
      });
      return {
        events: rows.map((r) => ({ ...r, id: r.id.toString(), createdAt: r.createdAt.toISOString() })),
        nextBefore: rows.length === req.query.limit ? rows[rows.length - 1]!.id.toString() : null,
      };
    },
  );

  app.get(
    '/v1/admin/audit/verify',
    {
      schema: {
        ...tag,
        summary: 'Recompute the whole hash chain: sha256(prev_hash + canonical(row)) for every row',
        response: { 200: z.object({ ok: z.boolean(), checked: z.number(), brokenAtId: z.string().optional(), reason: z.string().optional(), headHash: z.string() }) },
      },
      preHandler: anyStaff,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const result = await audit.verifyChain();
      await audit.append({ actorType: 'admin', actorId: adminId, action: 'admin.audit_verified', payload: { ok: result.ok, checked: result.checked } });
      return result;
    },
  );

  app.get(
    '/v1/admin/audit/export.csv',
    {
      schema: { ...tag, summary: 'CSV export of audit events (max 50,000 rows)', querystring: auditQuery.omit({ before: true, limit: true }) },
      preHandler: anyStaff,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { adminId } = adminAuth(req);
      const rows = await prisma.auditEvent.findMany({ where: auditWhere({ ...req.query, limit: 50 }), orderBy: { id: 'asc' }, take: 50_000 });
      await audit.append({ actorType: 'admin', actorId: adminId, action: 'admin.audit_exported', payload: { rows: rows.length, ...req.query } });
      const header = ['id', 'created_at', 'actor_type', 'actor_id', 'action', 'subject_type', 'subject_id', 'payload', 'prev_hash', 'hash'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [r.id.toString(), r.createdAt.toISOString(), r.actorType, r.actorId, r.action, r.subjectType, r.subjectId, r.payload, r.prevHash, r.hash].map(csvCell).join(','),
        );
      }
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="co-sign-audit-${new Date().toISOString().slice(0, 10)}.csv"`)
        .header('cache-control', 'no-store')
        .send(BOM + lines.join(CRLF) + CRLF);
    },
  );
}
