import type { Prisma, PrismaClient } from '@prisma/client';
import { sha256Hex } from '../../lib/crypto.js';

export const GENESIS_HASH = '0'.repeat(64);
// Arbitrary constant that identifies the audit-chain advisory lock.
const AUDIT_LOCK_KEY = 0x0c051960;

export type ActorType = 'user' | 'guardian' | 'admin' | 'device' | 'system' | 'anonymous';

export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  /** Never put personal data here: IDs, codes, counts and scores only. */
  payload?: Record<string, unknown>;
}

export interface AuditRecord {
  id: bigint;
  createdAt: Date;
  actorType: string;
  actorId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  payload: Prisma.JsonValue;
  prevHash: string;
  hash: string;
}

/** Deterministic JSON: object keys sorted recursively, so a row always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function hashAuditRow(
  prevHash: string,
  row: Pick<AuditRecord, 'createdAt' | 'actorType' | 'actorId' | 'action' | 'subjectType' | 'subjectId' | 'payload'>,
): string {
  const body = canonicalJson({
    ts: row.createdAt.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    payload: row.payload,
  });
  return sha256Hex(prevHash + body);
}

export type AuditListener = (record: AuditRecord) => void;

export class AuditService {
  private listeners: AuditListener[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  onAppend(listener: AuditListener): void {
    this.listeners.push(listener);
  }

  /** Append one event in its own transaction. */
  async append(input: AuditInput): Promise<AuditRecord> {
    const record = await this.prisma.$transaction((t) => this.insert(t, input));
    this.emit(record);
    return record;
  }

  /**
   * Run `fn` in a transaction whose audit events commit or roll back together with the change they
   * describe. Listeners (dashboard feed) are notified only after commit.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient, audit: (input: AuditInput) => Promise<AuditRecord>) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    const pending: AuditRecord[] = [];
    const result = await this.prisma.$transaction(
      (tx) =>
        fn(tx, async (input) => {
          const record = await this.insert(tx, input);
          pending.push(record);
          return record;
        }),
      { timeout: 15_000, ...options },
    );
    for (const r of pending) this.emit(r);
    return result;
  }

  private emit(record: AuditRecord): void {
    for (const l of this.listeners) {
      try {
        l(record);
      } catch {
        // Listener failures must never affect the audited operation.
      }
    }
  }

  private async insert(tx: Prisma.TransactionClient, input: AuditInput): Promise<AuditRecord> {
    // Serialise appends so every row links to exactly one predecessor.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    const last = await tx.auditEvent.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    // Millisecond precision so the stored timestamp round-trips exactly into the hash.
    const createdAt = new Date(Math.floor(Date.now()));
    const row = {
      createdAt,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      payload: (input.payload ?? {}) as Prisma.JsonObject,
    };
    const hash = hashAuditRow(prevHash, row);
    return tx.auditEvent.create({ data: { ...row, prevHash, hash } });
  }

  /** Recompute the whole chain in batches. Returns the first broken row, if any. */
  async verifyChain(batchSize = 1000): Promise<{ ok: boolean; checked: number; brokenAtId?: string; reason?: string; headHash: string }> {
    let prevHash = GENESIS_HASH;
    let cursor: bigint | undefined;
    let checked = 0;
    for (;;) {
      const rows: AuditRecord[] = await this.prisma.auditEvent.findMany({
        where: cursor === undefined ? {} : { id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        if (row.prevHash !== prevHash) {
          return { ok: false, checked, brokenAtId: row.id.toString(), reason: 'prev_hash_mismatch', headHash: prevHash };
        }
        const expected = hashAuditRow(prevHash, row);
        if (expected !== row.hash) {
          return { ok: false, checked, brokenAtId: row.id.toString(), reason: 'hash_mismatch', headHash: prevHash };
        }
        prevHash = row.hash;
        checked++;
      }
      cursor = rows[rows.length - 1]!.id;
    }
    return { ok: true, checked, headHash: prevHash };
  }
}
