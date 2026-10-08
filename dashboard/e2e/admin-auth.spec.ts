import { expect, test } from '@playwright/test';
import { addVirtualAuthenticator, createInvite, registerStaff } from './helpers';

test.describe('security console passkeys', () => {
  test('staff register from an invite, sign out, and sign back in with the same passkey', async ({ page }) => {
    const { cdp, authenticatorId } = await addVirtualAuthenticator(page);
    await registerStaff(page, 'admin', 'Security Lead');

    await expect(page.getByText('Signed in as')).toContainText('Security Lead');
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(credentials).toHaveLength(1);
    expect(credentials[0]!.isResidentCredential).toBe(true);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('a reused invite is refused with a plain-language explanation', async ({ page }) => {
    await addVirtualAuthenticator(page);
    const invite = createInvite('analyst');
    await page.goto(invite);
    await page.getByLabel('Username').fill(`an.${Date.now().toString(36)}`);
    await page.getByLabel('Your name').fill('Analyst');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.goto(invite);
    await page.getByLabel('Username').fill(`an2.${Date.now().toString(36)}`);
    await page.getByLabel('Your name').fill('Second');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.getByRole('alert')).toContainText('not valid or has already been used');
  });

  test('analysts do not see staff management', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'analyst', 'Read Only');
    await expect(page.getByRole('link', { name: 'Staff' })).toHaveCount(0);
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('admins can issue a one-time invite link', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'admin', 'Admin Two');
    await page.getByRole('link', { name: 'Staff' }).click();
    await page.getByLabel('Role').selectOption('analyst');
    await page.getByRole('button', { name: 'Create one-time link' }).click();
    await expect(page.getByRole('status')).toContainText('/register?invite=');
  });

  test('the live feed shows new events as they happen', async ({ page, browser }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'admin', 'Watcher');
    // A second staff member registering produces audit events that stream into the first console.
    const other = await browser.newPage();
    await addVirtualAuthenticator(other);
    await registerStaff(other, 'analyst', 'Someone Else');
    await expect(page.locator('.feed')).toContainText('admin.registered');
    await other.close();
  });

  test('a passkey prompt that fails explains what happened', async ({ page }) => {
    const { cdp, authenticatorId } = await addVirtualAuthenticator(page);
    // No credential exists on this authenticator, so the browser rejects the sign-in.
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page.getByRole('alert')).toContainText(/passkey/i, { timeout: 30_000 });
  });
});
