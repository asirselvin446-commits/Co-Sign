import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addVirtualAuthenticator, registerStaff } from './helpers';

test.describe('security console operations', () => {
  test('overview shows totals and charts with a table view', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'analyst', 'Chart Reader');
    await expect(page.getByText('Active accounts')).toBeVisible();
    const chart = page.getByRole('region', { name: 'Sensitive actions per day' });
    await expect(chart.locator('.recharts-wrapper')).toBeVisible();
    await chart.getByRole('button', { name: 'Show table' }).click();
    await expect(chart.getByRole('table')).toBeVisible();
    await expect(chart.getByRole('row')).toHaveCount(15); // header + 14 days

    // The table view stays open while the period changes.
    await page.getByLabel('Period').selectOption('7');
    await expect(chart.getByRole('row')).toHaveCount(8);
    await chart.getByRole('button', { name: 'Show chart' }).click();
    await expect(chart.locator('.recharts-wrapper')).toBeVisible();
  });

  test('an administrator previews and publishes a rule change, which is audited', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'admin', 'Rule Editor');
    await page.getByRole('link', { name: 'Risk rules' }).click();
    await expect(page.getByRole('heading', { name: /Version \d+ \(live\)/ })).toBeVisible();
    const publish = page.getByRole('button', { name: /Publish version \d+/ });
    const next = Number((await publish.textContent())!.match(/\d+/)![0]);
    await expect(publish).toBeDisabled();

    const weight = page.getByLabel('Code was pasted weight');
    const before = Number(await weight.inputValue());
    await weight.fill(String(before === 200 ? 199 : before + 1));
    await expect(page.getByRole('heading', { name: 'Draft' })).toBeVisible();

    await page.getByRole('button', { name: 'Preview impact' }).click();
    await expect(page.getByRole('status')).toContainText('Over the last 30 days');

    const note = `e2e change ${Date.now().toString(36)}`;
    await page.getByLabel('Reason for the change').fill(note);
    page.once('dialog', (d) => void d.accept());
    await publish.click();
    await expect(page.getByRole('status')).toContainText(`Version ${next} is live.`);
    await expect(page.getByRole('heading', { name: `Version ${next} (live)` })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(note) })).toContainText('Rule Editor');

    await page.getByRole('link', { name: 'Audit log' }).click();
    await page.getByLabel('Action starts with').fill('risk.');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('row').nth(1)).toContainText('risk.rules_published');
  });

  test('analysts can preview rules but not publish them', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'analyst', 'Rule Reader');
    await page.getByRole('link', { name: 'Risk rules' }).click();
    await expect(page.getByText('only administrators can publish')).toBeVisible();
    await expect(page.getByRole('button', { name: /Publish version/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview impact' }).click();
    await expect(page.getByRole('status')).toContainText('Over the last 30 days');
  });

  test('the audit chain verifies and the log exports as CSV', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'admin', 'Auditor');
    await page.getByRole('link', { name: 'Audit log' }).click();
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.getByRole('status')).toContainText(/Chain intact: all [\d,]+ events verified/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    expect(download.suggestedFilename()).toBe('cosign-audit.csv');
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv.split('\r\n')[0]).toBe('id,created_at,actor_type,actor_id,action,subject_type,subject_id,payload,prev_hash,hash');
    expect(csv).toContain('audit.chain_verified');
  });

  test('account lookup explains when nothing matches', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'analyst', 'Support');
    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByLabel('Username or account ID').fill('nobody-here');
    await page.getByRole('button', { name: 'Look up' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/users\?q=nobody-here/);
  });

  test('step-ups page filters and offers an export', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await registerStaff(page, 'analyst', 'Stepup Viewer');
    await page.getByRole('link', { name: 'Step-ups' }).click();
    await page.getByLabel('Guardian').selectOption('false');
    await expect(page.getByText('Loading…')).toHaveCount(0);
    // Passkey-only step-ups never show the guardian marker.
    await expect(page.getByRole('table').getByText('· guardian')).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    expect(download.suggestedFilename()).toBe('cosign-stepups.csv');
  });
});
