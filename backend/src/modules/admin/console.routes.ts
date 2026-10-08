import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { RISK_RULE_DEFAULTS, type RiskRuleKey } from '../../generated/catalog.js';
import { accountLimit, type Ctx, type ZApp } from '../../http/context.js';
import { adminAuth } from '../../http/auth.js';
import { toCsv } from '../../lib/csv.js';
import { AppError } from '../../lib/errors.js';
import { normaliseHandle } from '../users/users.service.js';
import { replayRuleSets, ruleSetSchema, type RuleConfig } from '../risk/engine.js';

// Read-mostly operations API for the security console. Everything here returns IDs, codes, counts
// and scores only: personal data stays encrypted and never leaves through staff endpoints.

const STEPUP_STATUSES = ['pending_user', 'pending_guardians', 'cooloff', 'ready_to_confirm', 'approved', 'completed', 'denied', 'cancelled', 'expired', 'failed'] as const;
const SENSITIVE_ACTIONS = [
  'add_device',
  'add_passkey',
  'remove_guardian',
  'change_phone',
  'change_email',
  'raise_transfer_limit',
  'add_payee',
  'transfer_above_limit',
  'view_recovery_codes',
  'delete_account',
] as const;
const OPEN_RECOVERY = ['pending_approvals', 'cancel_window', 'ready'] as const;
const RULE_KEYS = Object.keys(RISK_RULE_DEFAULTS) as RiskRuleKey[];
/** Upper bound on step-ups replayed by the rule preview, newest first. */
const REPLAY_LIMIT = 20_000;

/** Upper bound on rows in one CSV export. */
const EXPORT_LIMIT = 10_000;

const bearer = [{ bearer: [] }];

const stepupFilters = z.object({
  status: z.enum(STEPUP_STATUSES).optional(),
  action: z.enum(SENSITIVE_ACTIONS).optional(),
  guarded: z.enum(['true', 'false']).optional(),
});
const stepupWhere = (f: z.infer<typeof stepupFilters>): Prisma.StepupRequestWhereInput => ({
  status: f.status,
  action: f.action,
  ...(f.guarded ? { needsGuardian: f.guarded === 'true' } : {}),
});

const auditFilters = z.object({
  action: z.string().trim().max(80).optional(),
  actorType: z.enum(['user', 'guardian', 'admin', 'device', 'system', 'anonymous']).optional(),
  subjectId: z.string().trim().max(100).optional(),
});
const auditWhere = (f: z.infer<typeof auditFilters>): Prisma.AuditEventWhereInput => ({
  ...(f.action ? { action: { startsWith: f.action } } : {}),
  ...(f.actorType ? { actorType: f.actorType } : {}),
  ...(f.subjectId ? { subjectId: f.subjectId } : {}),
});

const csvName = (kind: string) => `cosign-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

/** Drafts must list every rule: a missing key would silently switch that rule off. */
const completeRuleSet = ruleSetSchema.refine((s) => RULE_KEYS.every((k) => s.rules.some((r) => r.key === k)), {
  message: 'every rule must be listed',
  path: ['rules'],
});

const ruleSchema = z.object({
  key: z.string(),
  weight: z.number(),
  enabled: z.boolean(),
  reasons: z.object({ en: z.string(), ta: z.string(), hi: z.string() }),
});
const versionSchema = z.object({
  version: z.number(),
  guardianThreshold: z.number(),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});

type RuleSetRow = Prisma.RiskRuleSetGetPayload<{ include: { createdBy: { select: { displayName: true } } } }>;
const describeVersion = (r: RuleSetRow) => ({
  version: r.version,
  guardianThreshold: r.guardianThreshold,
  note: r.note,
  createdAt: r.createdAt.toISOString(),
  createdBy: r.createdBy?.displayName ?? null,
});

export async function consoleRoutes(app: ZApp, ctx: Ctx): Promise<void> {
  const { deps, services, guards } = ctx;
  const { prisma } = deps;
  const tz = deps.config.DISPLAY_TIMEZONE;

  // ------------------------------------------------------------------ overview

  app.get(
    '/v1/admin/overview',
    {
      schema: {
        tags: ['admin'],
        summary: 'Activity totals and a daily step-up series for the last N days (days counted in DISPLAY_TIMEZONE)',
        security: bearer,
        querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
        response: {
          200: z.object({
            window: z.object({ days: z.number(), start: z.string(), timezone: z.string() }),
            totals: z.object({ activeUsers: z.number(), activeDevices: z.number(), activeGuardianLinks: z.number(), openRecoveries: z.number() }),
            stepups: z.object({
              byStatus: z.record(z.string(), z.number()),
              daily: z.array(z.object({ day: z.string(), total: z.number(), guarded: z.number(), denied: z.number(), completed: z.number() })),
            }),
            guardians: z.object({ approved: z.number(), denied: z.number(), medianResponseMs: z.number().nullable() }),
            risk: z.object({
              assessments: z.number(),
              topRules: z.array(z.object({ key: z.string(), count: z.number() })),
              ruleSetVersion: z.number(),
              guardianThreshold: z.number(),
            }),
            recoveries: z.object({ started: z.number(), completed: z.number(), cancelled: z.number() }),
          }),
        },
      },
      preHandler: guards.requireAdmin(),
    },
    async (req) => {
      const { days } = req.query;
      // Midnight in the display timezone, (days - 1) days ago, as an absolute instant.
      const [{ start }] = await prisma.$queryRaw<[{ start: Date }]>`
        SELECT ((date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${days - 1}::int)) AT TIME ZONE ${tz}) AS start`;
      const since = { gte: start };

      const [activeUsers, activeDevices, activeGuardianLinks, openRecoveries, byStatus, daily, decisions, assessments, topRules, recoveries, ruleSet] =
        await Promise.all([
          prisma.user.count({ where: { status: 'active' } }),
          prisma.device.count({ where: { revokedAt: null, user: { status: 'active' } } }),
          prisma.guardianLink.count({ where: { status: { in: ['active', 'pending_removal'] } } }),
          prisma.recovery.count({ where: { status: { in: [...OPEN_RECOVERY] } } }),
          prisma.stepupRequest.groupBy({ by: ['status'], where: { createdAt: since }, _count: { _all: true } }),
          prisma.$queryRaw<Array<{ day: string; total: number; guarded: number; denied: number; completed: number }>>`
            WITH days AS (
              SELECT generate_series(
                date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${days - 1}::int),
                date_trunc('day', now() AT TIME ZONE ${tz}),
                interval '1 day') AS d
            ), s AS (
              SELECT date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS d, needs_guardian, status
              FROM stepup_requests WHERE created_at >= ${start}
            )
            SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
                   count(s.d)::int AS total,
                   (count(s.d) FILTER (WHERE s.needs_guardian))::int AS guarded,
                   (count(s.d) FILTER (WHERE s.status = 'denied'))::int AS denied,
                   (count(s.d) FILTER (WHERE s.status IN ('approved', 'completed')))::int AS completed
            FROM days LEFT JOIN s ON s.d = days.d
            GROUP BY days.d ORDER BY days.d`,
          prisma.$queryRaw<[{ approved: number; denied: number; median_ms: number | null }]>`
            SELECT (count(*) FILTER (WHERE decision = 'approve'))::int AS approved,
                   (count(*) FILTER (WHERE decision = 'deny'))::int AS denied,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms) AS median_ms
            FROM guardian_decisions WHERE created_at >= ${start}`,
          prisma.riskSignal.count({ where: { createdAt: since } }),
          prisma.$queryRaw<Array<{ key: string; count: number }>>`
            SELECT rule AS key, count(*)::int AS count
            FROM risk_signals, unnest(matched_rules) AS rule
            WHERE created_at >= ${start}
            GROUP BY rule ORDER BY count DESC, rule`,
          prisma.recovery.groupBy({ by: ['status'], where: { createdAt: since }, _count: { _all: true } }),
          services.risk.activeRuleSet(),
        ]);

      const recoveryCount = (s: string) => recoveries.find((r) => r.status === s)?._count._all ?? 0;
      return {
        window: { days, start: start.toISOString(), timezone: tz },
        totals: { activeUsers, activeDevices, activeGuardianLinks, openRecoveries },
        stepups: { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])), daily },
        guardians: {
          approved: decisions[0].approved,
          denied: decisions[0].denied,
          medianResponseMs: decisions[0].median_ms === null ? null : Math.round(decisions[0].median_ms),
        },
        risk: { assessments, topRules, ruleSetVersion: ruleSet.version, guardianThreshold: ruleSet.guardianThreshold },
        recoveries: {
          started: recoveries.reduce((n, r) => n + r._count._all, 0),
          completed: recoveryCount('completed'),
          cancelled: recoveryCount('cancelled'),
        },
      };
    },
  );

  // ------------------------------------------------------------------ step-ups

  app.get(
    '/v1/admin/stepups',
    {
      schema: {
        tags: ['admin'],
        summary: 'Recent step-up requests, newest first (no action parameters: they may hold personal data)',
        security: bearer,
        querystring: stepupFilters.extend({
          cursor: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                userId: z.string(),
                deviceId: z.string(),
                action: z.string(),
                status: z.string(),
                score: z.number(),
                needsGuardian: z.boolean(),
                ruleSetVersion: z.number(),
                rules: z.array(z.object({ key: z.string(), weight: z.number() })),
                createdAt: z.string(),
                resolvedAt: z.string().nullable(),
                failureCode: z.string().nullable(),
                decisions: z.array(z.object({ decision: z.string(), responseMs: z.number(), createdAt: z.string() })),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
        },
      },
      preHandler: guards.requireAdmin(),
    },
    async (req) => {
      const { cursor, limit } = req.query;
      const rows = await prisma.stepupRequest.findMany({
        where: stepupWhere(req.query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { decisions: { orderBy: { createdAt: 'asc' }, select: { decision: true, responseMs: true, createdAt: true } } },
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((r) => ({
          id: r.id,
          userId: r.userId,
          deviceId: r.deviceId,
          action: r.action,
          status: r.status,
          score: r.score,
          needsGuardian: r.needsGuardian,
          ruleSetVersion: r.ruleSetVersion,
          rules: (r.reasons as Array<{ key: string; weight: number }>).map(({ key, weight }) => ({ key, weight })),
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
          failureCode: r.failureCode,
          decisions: r.decisions.map((d) => ({ decision: d.decision, responseMs: d.responseMs, createdAt: d.createdAt.toISOString() })),
        })),
        nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      };
    },
  );

  // ------------------------------------------------------------------ audit log

  app.get(
    '/v1/admin/audit',
    {
      schema: {
        tags: ['admin'],
        summary: 'Hash-chained audit log, newest first. `action` matches as a prefix (e.g. "stepup.").',
        security: bearer,
        querystring: auditFilters.extend({
          before: z.string().regex(/^\d{1,19}$/).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                createdAt: z.string(),
                actorType: z.string(),
                actorId: z.string().nullable(),
                action: z.string(),
                subjectType: z.string().nullable(),
                subjectId: z.string().nullable(),
                payload: z.unknown(),
                hash: z.string(),
              }),
            ),
            nextBefore: z.string().nullable(),
          }),
        },
      },
      preHandler: guards.requireAdmin(),
    },
    async (req) => {
      const { before, limit } = req.query;
      const rows = await prisma.auditEvent.findMany({
        where: { ...auditWhere(req.query), ...(before ? { id: { lt: BigInt(before) } } : {}) },
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((r) => ({
          id: r.id.toString(),
          createdAt: r.createdAt.toISOString(),
          actorType: r.actorType,
          actorId: r.actorId,
          action: r.action,
          subjectType: r.subjectType,
          subjectId: r.subjectId,
          payload: r.payload,
          hash: r.hash,
        })),
        nextBefore: rows.length > limit ? page[page.length - 1]!.id.toString() : null,
      };
    },
  );

  app.post(
    '/v1/admin/audit/verify',
    {
      schema: {
        tags: ['admin'],
        summary: 'Recompute the whole audit hash chain and record that a check was run',
        security: bearer,
        response: {
          200: z.object({ ok: z.boolean(), checked: z.number(), headHash: z.string(), brokenAtId: z.string().nullable(), reason: z.string().nullable() }),
        },
      },
      preHandler: guards.requireAdmin(),
      config: accountLimit(3, '1 minute'),
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const result = await deps.audit.verifyChain();
      await deps.audit.append({
        actorType: 'admin',
        actorId: adminId,
        action: result.ok ? 'audit.chain_verified' : 'audit.chain_broken',
        subjectType: 'audit_chain',
        payload: { ok: result.ok, checked: result.checked, brokenAtId: result.brokenAtId ?? null, reason: result.reason ?? null },
      });
      if (!result.ok) req.log.error({ brokenAtId: result.brokenAtId, reason: result.reason }, 'audit chain verification failed');
      return { ok: result.ok, checked: result.checked, headHash: result.headHash, brokenAtId: result.brokenAtId ?? null, reason: result.reason ?? null };
    },
  );

  // ------------------------------------------------------------------ CSV exports

  app.get(
    '/v1/admin/stepups/export.csv',
    {
      schema: { tags: ['admin'], summary: `Step-ups as CSV (newest first, up to ${EXPORT_LIMIT} rows)`, security: bearer, querystring: stepupFilters },
      preHandler: guards.requireAdmin(),
      config: accountLimit(10, '1 minute'),
    },
    async (req, reply) => {
      const { adminId } = adminAuth(req);
      const rows = await prisma.stepupRequest.findMany({
        where: stepupWhere(req.query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_LIMIT,
        include: { decisions: { select: { decision: true } } },
      });
      await deps.audit.append({
        actorType: 'admin',
        actorId: adminId,
        action: 'admin.exported',
        subjectType: 'stepups',
        payload: { rows: rows.length, filters: req.query },
      });
      const csv = toCsv(
        ['id', 'created_at', 'resolved_at', 'user_id', 'device_id', 'action', 'status', 'score', 'needs_guardian', 'rule_set_version', 'rules', 'approvals', 'denials', 'failure_code'],
        rows.map((r) => [
          r.id,
          r.createdAt.toISOString(),
          r.resolvedAt?.toISOString(),
          r.userId,
          r.deviceId,
          r.action,
          r.status,
          r.score,
          r.needsGuardian,
          r.ruleSetVersion,
          (r.reasons as Array<{ key: string }>).map((x) => x.key).join(' '),
          r.decisions.filter((d) => d.decision === 'approve').length,
          r.decisions.filter((d) => d.decision === 'deny').length,
          r.failureCode,
        ]),
      );
      return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${csvName('stepups')}"`).send(csv);
    },
  );

  app.get(
    '/v1/admin/audit/export.csv',
    {
      schema: { tags: ['admin'], summary: `Audit log as CSV (newest first, up to ${EXPORT_LIMIT} rows)`, security: bearer, querystring: auditFilters },
      preHandler: guards.requireAdmin(),
      config: accountLimit(10, '1 minute'),
    },
    async (req, reply) => {
      const { adminId } = adminAuth(req);
      const rows = await prisma.auditEvent.findMany({ where: auditWhere(req.query), orderBy: { id: 'desc' }, take: EXPORT_LIMIT });
      await deps.audit.append({
        actorType: 'admin',
        actorId: adminId,
        action: 'admin.exported',
        subjectType: 'audit',
        payload: { rows: rows.length, filters: req.query },
      });
      const csv = toCsv(
        ['id', 'created_at', 'actor_type', 'actor_id', 'action', 'subject_type', 'subject_id', 'payload', 'prev_hash', 'hash'],
        rows.map((r) => [r.id.toString(), r.createdAt.toISOString(), r.actorType, r.actorId, r.action, r.subjectType, r.subjectId, r.payload, r.prevHash, r.hash]),
      );
      return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${csvName('audit')}"`).send(csv);
    },
  );

  // ------------------------------------------------------------------ user lookup

  app.get(
    '/v1/admin/users/lookup',
    {
      schema: {
        tags: ['admin'],
        summary: 'Support view of one account by username or ID. No names, phone numbers or email addresses; each lookup is audited.',
        security: bearer,
        querystring: z.object({ q: z.string().trim().min(1).max(100) }),
        response: {
          200: z.object({
            id: z.string(),
            handle: z.string(),
            locale: z.string(),
            status: z.string(),
            createdAt: z.string(),
            deletedAt: z.string().nullable(),
            hasPhone: z.boolean(),
            phoneVerified: z.boolean(),
            hasEmail: z.boolean(),
            signalConsent: z.boolean(),
            passkeys: z.object({ active: z.number(), revoked: z.number() }),
            devices: z.array(
              z.object({
                id: z.string(),
                platform: z.string(),
                appVersion: z.string().nullable(),
                enrolledAt: z.string(),
                lastSeenAt: z.string(),
                revokedAt: z.string().nullable(),
                revokeReason: z.string().nullable(),
                integrityVerdict: z.string().nullable(),
                simChangedAt: z.string().nullable(),
              }),
            ),
            guardians: z.array(
              z.object({ linkId: z.string(), guardianId: z.string(), status: z.string(), activatesAt: z.string(), removesAt: z.string().nullable() }),
            ),
            guardingCount: z.number(),
            recentStepups: z.array(
              z.object({ id: z.string(), action: z.string(), status: z.string(), score: z.number(), needsGuardian: z.boolean(), createdAt: z.string() }),
            ),
            recoveries: z.array(
              z.object({ id: z.string(), status: z.string(), requiredApprovals: z.number(), approvals: z.number(), createdAt: z.string() }),
            ),
          }),
        },
      },
      preHandler: guards.requireAdmin(),
      config: accountLimit(60, '1 minute'),
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const q = req.query.q;
      const byId = z.uuid().safeParse(q).success;
      const user = await prisma.user.findUnique({
        where: byId ? { id: q } : { handle: normaliseHandle(q) },
        include: {
          credentials: { select: { revokedAt: true } },
          devices: { orderBy: { enrolledAt: 'desc' } },
          guardianLinks: { where: { status: { notIn: ['removed', 'cancelled'] } }, orderBy: { createdAt: 'asc' } },
          stepupRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
          recoveries: { orderBy: { createdAt: 'desc' }, take: 5, include: { _count: { select: { approvals: true } } } },
        },
      });
      if (!user) throw new AppError('NOT_FOUND');
      const [guardingCount, signalConsent] = await Promise.all([
        prisma.guardianLink.count({ where: { guardianId: user.id, status: { in: ['active', 'pending_removal'] } } }),
        services.risk.hasSignalConsent(user.id),
      ]);
      await deps.audit.append({ actorType: 'admin', actorId: adminId, action: 'admin.user_viewed', subjectType: 'user', subjectId: user.id });
      const iso = (d: Date | null) => d?.toISOString() ?? null;
      return {
        id: user.id,
        handle: user.handle,
        locale: user.locale,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        deletedAt: iso(user.deletedAt),
        hasPhone: user.phoneHash !== null,
        phoneVerified: user.phoneVerifiedAt !== null,
        hasEmail: user.emailHash !== null,
        signalConsent,
        passkeys: {
          active: user.credentials.filter((c) => !c.revokedAt).length,
          revoked: user.credentials.filter((c) => c.revokedAt).length,
        },
        devices: user.devices.map((d) => ({
          id: d.id,
          platform: d.platform,
          appVersion: d.appVersion,
          enrolledAt: d.enrolledAt.toISOString(),
          lastSeenAt: d.lastSeenAt.toISOString(),
          revokedAt: iso(d.revokedAt),
          revokeReason: d.revokeReason,
          integrityVerdict: d.integrityVerdict,
          simChangedAt: iso(d.simChangedAt),
        })),
        guardians: user.guardianLinks.map((l) => ({
          linkId: l.id,
          guardianId: l.guardianId,
          status: l.status,
          activatesAt: l.activatesAt.toISOString(),
          removesAt: iso(l.removesAt),
        })),
        guardingCount,
        recentStepups: user.stepupRequests.map((r) => ({
          id: r.id,
          action: r.action,
          status: r.status,
          score: r.score,
          needsGuardian: r.needsGuardian,
          createdAt: r.createdAt.toISOString(),
        })),
        recoveries: user.recoveries.map((r) => ({
          id: r.id,
          status: r.status,
          requiredApprovals: r.requiredApprovals,
          approvals: r._count.approvals,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  );

  // ------------------------------------------------------------------ risk rules

  app.get(
    '/v1/admin/risk/rules',
    {
      schema: {
        tags: ['admin'],
        summary: 'Active risk rule set and version history',
        security: bearer,
        response: { 200: z.object({ active: versionSchema.extend({ rules: z.array(ruleSchema) }), versions: z.array(versionSchema) }) },
      },
      preHandler: guards.requireAdmin(),
    },
    async () => {
      await services.risk.activeRuleSet(); // seeds version 1 on a fresh database
      const versions = await prisma.riskRuleSet.findMany({
        orderBy: { version: 'desc' },
        take: 50,
        include: { createdBy: { select: { displayName: true } } },
      });
      const active = versions[0]!;
      return {
        active: { ...describeVersion(active), rules: active.rules as unknown as RuleConfig[] },
        versions: versions.map(describeVersion),
      };
    },
  );

  app.get(
    '/v1/admin/risk/rules/:version',
    {
      schema: {
        tags: ['admin'],
        security: bearer,
        params: z.object({ version: z.coerce.number().int().min(1) }),
        response: { 200: versionSchema.extend({ rules: z.array(ruleSchema) }) },
      },
      preHandler: guards.requireAdmin(),
    },
    async (req) => {
      const row = await prisma.riskRuleSet.findUnique({
        where: { version: req.params.version },
        include: { createdBy: { select: { displayName: true } } },
      });
      if (!row) throw new AppError('NOT_FOUND');
      return { ...describeVersion(row), rules: row.rules as unknown as RuleConfig[] };
    },
  );

  app.post(
    '/v1/admin/risk/rules/preview',
    {
      schema: {
        tags: ['admin'],
        summary: 'Replay recent step-ups under a draft rule set to see how many would need a guardian',
        security: bearer,
        body: z.object({ draft: completeRuleSet, days: z.number().int().min(1).max(90).default(30) }),
        response: {
          200: z.object({
            days: z.number(),
            activeVersion: z.number(),
            assessed: z.number(),
            truncated: z.boolean(),
            guardedBefore: z.number(),
            guardedAfter: z.number(),
            newlyGuarded: z.number(),
            noLongerGuarded: z.number(),
            unobservable: z.array(z.string()),
          }),
        },
      },
      preHandler: guards.requireAdmin(),
      config: accountLimit(30, '1 minute'),
    },
    async (req) => {
      const { draft, days } = req.body;
      const active = await services.risk.activeRuleSet();
      const rows = await prisma.stepupRequest.findMany({
        where: { createdAt: { gte: new Date(Date.now() - days * 24 * 3600_000) } },
        orderBy: { createdAt: 'desc' },
        take: REPLAY_LIMIT + 1,
        select: { reasons: true },
      });
      const history = rows.slice(0, REPLAY_LIMIT).map((r) => (r.reasons as Array<{ key: string }>).map((x) => x.key));
      return { days, activeVersion: active.version, truncated: rows.length > REPLAY_LIMIT, ...replayRuleSets(active, draft, history) };
    },
  );

  app.post(
    '/v1/admin/risk/rules',
    {
      schema: {
        tags: ['admin'],
        summary: 'Publish a new risk rule-set version (administrators only)',
        security: bearer,
        body: z.object({
          baseVersion: z.number().int().min(1),
          note: z.string().trim().min(3).max(200),
          draft: completeRuleSet,
        }),
        response: { 200: z.object({ version: z.number() }) },
      },
      preHandler: guards.requireAdmin(['admin']),
      config: accountLimit(20, '1 minute'),
    },
    async (req) => {
      const { adminId } = adminAuth(req);
      const { baseVersion, note, draft } = req.body;
      const published = await services.risk.publishRuleSet(adminId, { ...draft, note, baseVersion });
      return { version: published.version };
    },
  );
}
