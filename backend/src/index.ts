import { loadConfig } from './config.js';
import { closeDeps, createDeps } from './deps.js';
import { buildApp } from './app.js';
import { attachRealtime } from './modules/realtime/socket.js';
import { startJobs } from './jobs/scheduler.js';
import { createAdminInvite } from './modules/admin/admin-auth.routes.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = await createDeps(config);
  const { app, ctx } = await buildApp(deps);
  await app.ready();
  const io = await attachRealtime(app.server, ctx);
  const stopJobs = config.JOBS_ENABLED ? startJobs(ctx) : () => {};

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.log.info({ signal }, 'shutting down');
    stopJobs();
    await new Promise<void>((r) => io.close(() => r()));
    await app.close();
    await closeDeps(deps);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.HOST, port: config.PORT });

  if (config.BOOTSTRAP_ADMIN_INVITE && (await deps.prisma.admin.count()) === 0) {
    const { url, expiresAt } = await createAdminInvite(ctx, 'admin', null);
    deps.log.warn({ url, expiresAt }, 'No staff accounts yet. Open this one-time link to create the first administrator.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
