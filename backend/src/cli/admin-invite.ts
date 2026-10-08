/**
 * Create a one-time staff invite link for the security dashboard.
 *   pnpm --filter @co-sign/backend admin:invite -- --role admin
 * The first admin must be created this way; later staff can be invited from the dashboard.
 */
import { loadConfig } from '../config.js';
import { closeDeps, createDeps } from '../deps.js';
import { createAdminInvite } from '../modules/admin/admin-auth.routes.js';

async function main() {
  const roleArg = process.argv.indexOf('--role');
  const role = roleArg >= 0 ? process.argv[roleArg + 1] : 'admin';
  if (role !== 'admin' && role !== 'analyst') {
    console.error('Usage: admin-invite --role admin|analyst');
    process.exit(2);
  }
  const config = loadConfig();
  const deps = await createDeps({ ...config, LOG_LEVEL: 'warn' });
  try {
    const { url, expiresAt } = await createAdminInvite({ deps }, role, null);
    console.log(`One-time ${role} invite (expires ${expiresAt}):\n${url}`);
  } finally {
    await closeDeps(deps);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
