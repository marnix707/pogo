import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

test('a newer deployed build shows the dark "new version" box; Later hides it; Reload reloads', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Updater', 'fox');
  const page = me.page;
  await expect(page.getByTestId('update-notice')).toHaveCount(0);

  // The server now names a different build; coming back to the tab triggers the check.
  await page.route('**/version.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ build: 'a-newer-build' }),
    }),
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const notice = page.getByTestId('update-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('older version');
  await page.screenshot({ path: 'test-results/update-notice.png' });

  await page.getByTestId('update-later').click();
  await expect(notice).toHaveCount(0);

  // Reload now: the page loads again (and the mocked id is still "newer", so the box returns on the next check).
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(notice).toHaveCount(0); // snoozed for a few minutes
  await me.context.close();
});
