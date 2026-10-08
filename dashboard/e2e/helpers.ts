import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { backendEnv } from '../playwright.config';

const backendDir = path.resolve(import.meta.dirname, '../../backend');

/** Create a one-time staff invite with the real CLI and return its path (/register?invite=...). */
export function createInvite(role: 'admin' | 'analyst'): string {
  const tsx = createRequire(path.join(backendDir, 'package.json')).resolve('tsx/cli');
  const out = execFileSync(process.execPath, [tsx, 'src/cli/admin-invite.ts', '--role', role], {
    cwd: backendDir,
    env: { ...process.env, ...backendEnv, LOG_LEVEL: 'silent' },
    encoding: 'utf8',
  });
  const url = out.trim().split(/\s+/).pop()!;
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/**
 * Attach a CDP virtual authenticator (internal platform authenticator with resident keys and
 * user verification), the same capabilities a phone or laptop passkey provider offers.
 */
export async function addVirtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  // A distinct client address per test, so per-IP sign-in rate limits do not couple unrelated tests.
  const ip = `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${1 + ((Math.random() * 250) | 0)}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

export async function registerStaff(page: Page, role: 'admin' | 'analyst', displayName: string): Promise<string> {
  const handle = `${role}.${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  await page.goto(createInvite(role));
  await page.getByLabel('Username').fill(handle);
  await page.getByLabel('Your name').fill(displayName);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.getByRole('heading', { name: 'Overview' }).waitFor();
  return handle;
}
