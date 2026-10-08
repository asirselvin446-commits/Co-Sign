import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import type { TestProject } from 'vitest/node';
import pg from './pg.js';

/**
 * Starts Postgres and Redis with Testcontainers (or uses TEST_PG_ADMIN_URL / TEST_REDIS_URL when set,
 * e.g. CI service containers), then builds a migrated template database that every test file clones.
 */
export default async function setup(project: TestProject) {
  const stops: Array<() => Promise<unknown>> = [];
  let adminUrl = process.env.TEST_PG_ADMIN_URL;
  let redisUrl = process.env.TEST_REDIS_URL;

  if (!adminUrl) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('postgres')
      .withUsername('cosign')
      .withPassword('cosign')
      .start();
    adminUrl = container.getConnectionUri();
    stops.push(() => container.stop());
  }
  if (!redisUrl) {
    const { RedisContainer } = await import('@testcontainers/redis');
    const container = await new RedisContainer('redis:7-alpine').start();
    redisUrl = container.getConnectionUrl();
    stops.push(() => container.stop());
  }

  const template = `cosign_tpl_${randomBytes(4).toString('hex')}`;
  await pg.exec(adminUrl, `CREATE DATABASE ${template}`);
  const templateUrl = pg.withDatabase(adminUrl, template);
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: templateUrl },
    stdio: 'pipe',
  });

  project.provide('pgAdminUrl', adminUrl);
  project.provide('pgTemplate', template);
  project.provide('redisUrl', redisUrl);

  return async () => {
    await pg.exec(adminUrl!, `DROP DATABASE IF EXISTS ${template} WITH (FORCE)`).catch(() => {});
    for (const stop of stops.reverse()) await stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplate: string;
    redisUrl: string;
  }
}
