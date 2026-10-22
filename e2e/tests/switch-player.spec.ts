import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newPlayer } from './karma-helpers';

async function openSwitch(page: Page) {
  await page.getByTestId('settings-button').click();
  await page.getByRole('button', { name: /Switch player/ }).click();
  await expect(page.getByTestId('switch-dialog')).toBeVisible();
}

test('a guest who switches player can continue as them again (nothing is lost)', async ({
  browser,
}) => {
  const { page, context } = await newPlayer(browser, 'Switcher', 'fox');
  await openSwitch(page);
  // The guest is kept on this device, so the warning is the soft one.
  await expect(page.getByTestId('switch-dialog')).toHaveAttribute('data-severity', 'soft');
  await page.getByTestId('switch-confirm').click();

  // A fresh sign-in page: the field takes focus when tapped, and the saved guest is offered.
  await expect(page.getByTestId('saved-players')).toBeVisible();
  await page.getByTestId('signin-nickname').click();
  await expect(page.getByTestId('signin-nickname')).toBeFocused();
  await page.getByRole('button', { name: /Continue as Switcher/ }).click();
  await expect(page.getByTestId('home-nickname')).toHaveText('Switcher');
  await context.close();
});

test('forgetting a saved guest warns strongly, unless a recovery link was saved', async ({
  browser,
}) => {
  const { page, context } = await newPlayer(browser, 'Forgetter', 'fox');
  await openSwitch(page);
  await page.getByTestId('switch-confirm').click();
  await page.getByRole('button', { name: /Forget Forgetter/ }).click();
  await expect(page.locator('[data-severity=strong]')).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();

  // Sign in again, save a recovery link (the clipboard may be blocked: the page then prompts), switch again.
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /Continue as Forgetter/ }).click();
  await expect(page.getByTestId('home-nickname')).toHaveText('Forgetter');
  await page.getByTestId('home-avatar').click();
  await page.getByTestId('profile-copy-recovery').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openSwitch(page);
  await page.getByTestId('switch-confirm').click();
  await page.getByRole('button', { name: /Forget Forgetter/ }).click();
  await expect(page.locator('[data-severity=soft]')).toBeVisible();
  await context.close();
});

test('a recovery link logs a device in as that guest', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Linked', 'fox');
  const token = await page.evaluate(() => localStorage.getItem('pogo.token'));
  const other = await browser.newContext({ reducedMotion: 'reduce' });
  const phone = await other.newPage();
  await phone.goto(`/?recover=${encodeURIComponent(token ?? '')}`);
  await expect(phone.getByTestId('home-nickname')).toHaveText('Linked');
  expect(phone.url()).not.toContain('recover=');
  await other.close();
  await context.close();
});
