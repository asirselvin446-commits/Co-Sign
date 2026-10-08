// End-to-end: real WebAuthn ceremonies against Chromium's virtual authenticator.
// Each "device" is its own browser context with its own authenticator.
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function device(browser, path = '/') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(path);
  return { context, page };
}

const message = (page) => page.locator('#message .message-what');

let amma; // the account holder's phone
let selvin; // the guardian's phone

test.afterAll(async () => {
  await amma?.context.close();
  await selvin?.context.close();
});

test('user registers with a passkey and signs in again without a username', async ({ browser }) => {
  amma = await device(browser);
  const { page } = amma;
  await page.fill('#register-name', 'Amma');
  await page.click('#register-form button[type=submit]');
  await expect(page.locator('#hello')).toHaveText('Hello, Amma');
  await expect(message(page)).toContainText('Your account is ready');

  await page.click('#sign-out');
  await expect(page.locator('#screen-welcome')).toBeVisible();
  await page.click('#sign-in');
  await expect(page.locator('#hello')).toHaveText('Hello, Amma');
  await expect(message(page)).toContainText('signed in');
});

test('guardian accepts an invite and registers their own passkey', async ({ browser }) => {
  const { page } = amma;
  await page.click('#invite');
  const link = await page.locator('#invite-link').inputValue();
  expect(link).toContain('/guardian.html?invite=');

  selvin = await device(browser, new URL(link).pathname + new URL(link).search);
  const g = selvin.page;
  await expect(g.locator('#g-invite-title')).toHaveText('Amma asked you to be their guardian.');
  await g.fill('#g-name', 'Selvin');
  await g.click('#g-register-form button[type=submit]');
  await expect(g.locator('#g-guarding')).toHaveText('You protect: Amma');
  await expect(message(g)).toContainText('guardian for Amma');

  // The user's page learns about the new guardian live.
  await expect(page.locator('#guardian-list')).toContainText('Selvin');

  // The invite is single-use.
  const reuse = await (await browser.newContext()).newPage();
  await reuse.goto(new URL(link).pathname + new URL(link).search);
  await expect(message(reuse)).toContainText('expired or was already used');
  await reuse.context().close();
});

test('high-risk step-up is paused and approved by the guardian with their passkey', async () => {
  const { page } = amma;
  const g = selvin.page;
  // Unknown caller (+40) on a device added minutes ago (+20) = 60, over the threshold of 50.
  await page.check('[data-signal="unknownCall"]');
  await expect(page.locator('#safety-score')).toContainText('Risk score 60');

  await page.click('form[data-action="add_device"] button');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#pause-status')).toContainText('We’ve asked Selvin to check');
  await expect(page.locator('#pause-warning')).toBeVisible();
  await expect(page.locator('#pause-reasons')).toContainText('not in the contacts');

  const card = g.locator('.request').first();
  await expect(card).toContainText('Amma needs you');
  await expect(card).toContainText('Add a new device');
  await expect(card).toContainText('not in the contacts');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(message(g)).toContainText('You approved');
  await expect(g.locator('.request')).toHaveCount(0);

  await expect(page.locator('#pause-status')).toContainText('Selvin approved');
  await page.click('#pause-finish');
  await expect(message(page)).toContainText('Enter code');
  await expect(page.locator('#pause')).toBeHidden();
});

test('step-up denied by the guardian stops the action', async () => {
  const { page } = amma;
  const g = selvin.page;
  await page.fill('#new-phone', '9123456789');
  await page.click('form[data-action="change_phone"] button');
  await expect(page.locator('#pause')).toBeVisible();

  const card = g.locator('.request').first();
  await expect(card).toContainText('Change phone number');
  await expect(card).toContainText('6789');
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(message(g)).toContainText('You said no');

  await expect(page.locator('#pause-status')).toContainText('Selvin said no');
  await expect(page.locator('#message .message-next')).toContainText('hang up');
  await expect(page.locator('#pause-finish')).toBeHidden();
  await page.click('#pause-close');
  await expect(page.locator('#acct-phone')).not.toContainText('6789');
});

test('no guardian answer starts a cool-off, never a permanent lockout; the user can cancel', async () => {
  const { page } = amma;
  // Cancel path first.
  await page.click('form[data-action="show_otp"] button');
  await expect(page.locator('#pause-status')).toContainText('asked Selvin');
  await page.click('#pause-cancel');
  await expect(message(page)).toContainText('Cancelled');
  await expect(selvin.page.locator('.request')).toHaveCount(0);

  // Now nobody answers: guardian window (8s) passes, then the cool-off (4s).
  await page.selectOption('#new-limit', '500000');
  await page.click('form[data-action="raise_limit"] button');
  await expect(page.locator('#pause-status')).toContainText('asked Selvin');
  await expect(page.locator('#pause-countdown')).toContainText('Unlocks in', { timeout: 15_000 });
  await expect(message(page)).toContainText('No guardian answered');
  await expect(page.locator('#pause-finish')).toBeHidden();

  await expect(page.locator('#pause-status')).toContainText('waiting time is over', { timeout: 10_000 });
  await page.click('#pause-finish');
  await expect(message(page)).toContainText('5,00,000');
  await expect(page.locator('#acct-limit')).toHaveText('₹5,00,000');
});

test('OTP typed in Tamil digits is explained and fixed in one tap', async () => {
  const { page } = amma;
  await page.click('#pay-form button[type=submit]');
  const sms = await page.locator('#sms-text').textContent();
  const otp = sms.match(/\d{6}/)[0];
  const tamil = [...otp].map((d) => String.fromCodePoint(0x0be6 + Number(d))).join('');

  await page.fill('#otp', tamil);
  await expect(message(page)).toContainText('typed in Tamil digits');
  await expect(page.locator('#convert-digits')).toBeVisible();

  // Same explanation in Tamil when the language changes.
  await page.click('#lang-switch button[data-lang="ta"]');
  await page.fill('#otp', '');
  await page.fill('#otp', tamil);
  await expect(message(page)).toContainText('தமிழ் எண்களில்');
  await page.click('#lang-switch button[data-lang="en"]');

  await page.click('#convert-digits');
  await expect(page.locator('#otp')).toHaveValue(otp);
  await page.click('#otp-form button[type=submit]');
  await expect(message(page)).toContainText('Paid ₹500 to Ravi Stores');
});

test('lost phone: guardian approves, old session sees cancel window, new passkey works', async ({ browser }) => {
  // An unknown name gets exactly the same answer (no account enumeration).
  const stranger = await device(browser);
  await stranger.page.click('#go-recover');
  await stranger.page.fill('#recover-name', 'Nobody Here');
  await stranger.page.click('#recover-form button[type=submit]');
  await expect(message(stranger.page)).toContainText('If this account has guardians');
  const strangerText = await message(stranger.page).textContent();
  await stranger.context.close();

  const newPhone = await device(browser);
  const p = newPhone.page;
  await p.click('#go-recover');
  await p.fill('#recover-name', 'amma');
  await p.click('#recover-form button[type=submit]');
  await expect(message(p)).toHaveText(strangerText);

  // Amma's old phone is still signed in and is warned.
  await expect(amma.page.locator('#recovery-alert')).toBeVisible();

  const card = selvin.page.locator('.request').first();
  await expect(card).toContainText('Recover the account');
  await expect(card).toContainText('asked you in person');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(message(selvin.page)).toContainText('You approved');

  await expect(p.locator('#recover-progress')).toContainText('old devices can cancel');
  await expect(p.locator('#recover-register')).toBeVisible({ timeout: 10_000 });
  await p.click('#recover-register');
  await expect(p.locator('#hello')).toHaveText('Hello, Amma');
  await expect(amma.page.locator('#recovery-alert')).toBeHidden();

  // The new passkey signs in on its own.
  await p.click('#sign-out');
  await p.click('#sign-in');
  await expect(p.locator('#hello')).toHaveText('Hello, Amma');
  await newPhone.context.close();
});

test('security dashboard shows counters and the audit log', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page.locator('#live')).toHaveText('Live');
  await expect(page.locator('[data-counter="logins"] dd')).not.toHaveText('0');
  await expect(page.locator('[data-counter="approved"] dd')).toHaveText('2');
  await expect(page.locator('[data-counter="denied"] dd')).toHaveText('1');
  await expect(page.locator('[data-counter="recoveries"] dd')).toHaveText('2');
  await expect(page.locator('#feed')).toContainText('Selvin denied');
  await page.click('[data-filter="decisions"]');
  await expect(page.locator('#feed .event').first()).toBeVisible();
});
