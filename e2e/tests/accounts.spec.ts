import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { readyAll } from './karma-helpers';

async function newPlayer(browser: Browser, nickname: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill(nickname);
  await page.getByRole('button', { name: 'fox', exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText(nickname);
  return { context, page };
}

/** The dev mail log keeps the last mail per address (MAIL_MODE=log); read its 6-digit code. */
async function codeFor(page: Page, email: string) {
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/dev/last-mail?to=${encodeURIComponent(email)}`);
      return res.ok() ? ((await res.json()) as { code: string | null }).code : null;
    })
    .toMatch(/^\d{6}$/);
  const res = await page.request.get(`/api/dev/last-mail?to=${encodeURIComponent(email)}`);
  return ((await res.json()) as { code: string }).code;
}

test('a guest registers with an emailed code, stays logged in, logs out and back in', async ({
  browser,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const me = await newPlayer(browser, 'Regi');
  const page = me.page;

  await page.getByTestId('home-avatar').click();
  await page.getByTestId('account-register').click();
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-send').click();
  await page.getByTestId('register-code').fill(await codeFor(page, email));
  await page.getByTestId('register-password').fill('secret-pass-1');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('account-email')).toContainText(email);

  // Still registered after a reload (same token).
  await page.reload();
  await page.getByTestId('home-avatar').click();
  await expect(page.getByTestId('account-email')).toContainText(email);

  // Log out, then log in again from the sign-in page.
  await page.getByTestId('account-logout').click();
  await page.getByTestId('signin-login').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('secret-pass-1');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText('Regi');
  await page.getByTestId('home-avatar').click();
  await expect(page.getByTestId('account-email')).toContainText(email);
  await me.context.close();
});

test('the leaderboard opens and invites guests to register', async ({ browser }) => {
  const me = await newPlayer(browser, 'Boardy');
  const page = me.page;
  await page.getByTestId('home-leaderboard').click();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await expect(page.getByTestId('leaderboard-register')).toBeVisible();
  await page.getByTestId('leaderboard-register').click();
  await expect(page.getByTestId('register-email')).toBeVisible();
  await me.context.close();
});

test('a guest who finishes a solo Yatzy game is nudged to register', async ({ browser }) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Solo');
  const page = me.page;
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-yatzy').click();
  await readyAll(page);
  for (let turn = 0; turn < 13; turn++) {
    await page.getByTestId('roll-button').click();
    await expect(page.getByTestId('die-0')).not.toHaveAttribute('data-value', '0');
    const choice = page.locator('[data-testid^="pick-"]').first();
    await expect(choice).not.toHaveText('?');
    await choice.click();
    await page.getByTestId('score-button').click();
  }
  await expect(page.getByTestId('results-panel')).toBeVisible();
  await expect(page.getByTestId('register-nudge')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('nudge-register').click();
  await expect(page.getByTestId('register-email')).toBeVisible();
  await me.context.close();
});
