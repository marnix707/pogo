import { expect, test } from '@playwright/test';
import { readyAll, openLobbySettings } from './karma-helpers';

// The other specs use reduced motion (no tutorial); this one plays it for real.
test('Karma tutorial shows every time until "Don\'t show this again" is ticked', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Newbie');
  await page.getByTestId('signin-submit').click();
  // Skip the opening animation's wait for the first tap.
  await page.mouse.click(200, 400);
  await expect(page.getByTestId('home-play')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await readyAll(page);

  const tutorial = page.getByTestId('karma-tutorial');
  await expect(tutorial).toBeVisible();
  await page.screenshot({ path: 'test-results/tutorial-1.png' });
  await expect(page.getByTestId('tutorial-caption')).toContainText('floating');
  // Nothing advances by itself: still on step 0 a while later.
  await page.waitForTimeout(3000);
  await expect(tutorial).toHaveAttribute('data-step', '0');
  // Next goes one step (not one chapter); so does a tap anywhere on the screen.
  await page.getByTestId('tutorial-next').click();
  await expect(tutorial).toHaveAttribute('data-step', '1');
  await expect(tutorial).toHaveAttribute('data-scene', '0');
  await page.mouse.click(200, 120);
  await expect(tutorial).toHaveAttribute('data-step', '2');
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click(); // step 4: the second scene starts
  await expect(tutorial).toHaveAttribute('data-scene', '1');
  await page.screenshot({ path: 'test-results/tutorial-4.png' });
  for (let i = 0; i < 7; i++) await page.getByTestId('tutorial-next').click();
  await expect(tutorial).toHaveAttribute('data-step', '11');
  await page.getByTestId('tutorial-next').click(); // "Got it!"
  await expect(tutorial).toHaveCount(0);

  // Without the tick it comes back every time (here: after a reload in the same swap phase)...
  await page.reload();
  await expect(page.getByTestId('karma-game')).toBeVisible();
  await expect(tutorial).toBeVisible();
  // ...until "Don't show this again" is ticked.
  await page.getByTestId('tutorial-dont-show').check();
  await page.getByTestId('tutorial-skip').click();
  await expect(tutorial).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('karma-game')).toBeVisible();
  await expect(tutorial).toHaveCount(0);
  await context.close();
});
