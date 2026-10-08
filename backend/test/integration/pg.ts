import { PrismaClient } from '@prisma/client';

/** Tiny helpers for database administration in tests (create/drop per-file databases). */
function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  u.searchParams.set('schema', 'public');
  return u.toString();
}

async function exec(adminUrl: string, sql: string): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: withDatabase(adminUrl, 'postgres') });
  try {
    await client.$executeRawUnsafe(sql);
  } finally {
    await client.$disconnect();
  }
}

export default { withDatabase, exec };
