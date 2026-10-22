import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newPlayer, readyAll } from './karma-helpers';

/** My turn: play the first playable card (a wild gets red), else draw / pass. Presses UNO! when it is urgent. */
async function takeUnoTurn(page: Page) {
  const urgent = page.getByTestId('uno-button');
  if ((await urgent.getAttribute('data-state')) === 'urgent') await urgent.click();
  const playable = page.locator('[data-testid^=lastcard-card-][data-playable=true]').first();
  if (await playable.count()) {
    await playable.click();
    const picker = page.getByTestId('lastcard-color-picker');
    if (await picker.isVisible()) await page.getByTestId('lastcard-color-0').click();
    return;
  }
  const pass = page.getByTestId('lastcard-pass');
  if (await pass.isVisible()) await pass.click();
  else await page.getByTestId('lastcard-draw-button').click();
}

test('UNO against two computers: the table shows, UNO! is announced, the game ends with standings', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { page } = await newPlayer(browser, 'Una', 'fox');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-lastcard').click();
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'More Computer players' }).click();
  await readyAll(page);
  await expect(page.getByTestId('lastcard-game')).toBeVisible();
  await expect(page.locator('[data-testid^=lastcard-card-]')).toHaveCount(7);
  await page.screenshot({ path: 'test-results/lastcard-table.png' });

  let sawCall = false;
  const started = Date.now();
  while (!(await page.getByTestId('results-panel').isVisible())) {
    if (Date.now() - started > 200_000) throw new Error('the UNO game did not finish');
    if (await page.getByTestId('uno-called').isVisible()) {
      if (!sawCall) await page.screenshot({ path: 'test-results/uno-called.png' });
      sawCall = true;
    }
    const myTurn =
      (await page.getByTestId('lastcard-hand').getAttribute('data-dimmed')) === 'false';
    if (!myTurn) {
      await page.waitForTimeout(80);
      continue;
    }
    const before = await page.getByTestId('lastcard-event').getAttribute('data-seq');
    await takeUnoTurn(page).catch(() => undefined);
    await expect
      .poll(async () => page.getByTestId('lastcard-event').getAttribute('data-seq'), {
        timeout: 8000,
      })
      .not.toBe(before)
      .catch(() => undefined);
  }
  await expect(page.getByTestId('results-panel')).toBeVisible();
  await page.screenshot({ path: 'test-results/lastcard-results.png' });
  // The computers always call UNO! (with the card): somebody called it during the game.
  expect(sawCall).toBe(true);
});
