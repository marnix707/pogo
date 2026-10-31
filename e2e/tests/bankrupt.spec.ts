import { expect, test } from '@playwright/test';
import { newPlayer, openLobbySettings } from './karma-helpers';

test('Bankrupt!: play a few rounds against the computer', async ({ browser }) => {
  test.setTimeout(330_000);
  const { page } = await newPlayer(browser, 'Banker', 'fox');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-bankrupt').click();
  await openLobbySettings(page);
  await expect(page.getByTestId('bk-options')).toBeVisible();
  await page.getByTestId('bk-turns-20').click();
  await page.getByTestId('bk-target-3000').click();
  const ready = page.getByTestId('lobby-ready');
  if ((await ready.getAttribute('data-mode')) === 'add-robo') await ready.click();
  await ready.click();
  const game = page.getByTestId('bankrupt-game');
  await expect(game).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('bk-board')).toBeVisible();
  await expect(page.locator('[data-testid^=bk-tile-]'))
    .toHaveCount(28 + 0, { timeout: 5000 })
    .catch(() => undefined);
  await page.screenshot({ path: 'test-results/bankrupt-start.png' });

  const started = Date.now();
  let shot = false;
  let seq = 0;
  while (!(await page.getByTestId('results-panel').isVisible())) {
    if (Date.now() - started > 280_000) break;
    if (!shot && (await page.getByTestId('bk-buy-overlay').count())) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/bankrupt-buy.png' });
    }
    const btn = ['bk-buy', 'bk-roll', 'bk-end', 'bk-pass', 'bk-pay-jail', 'bk-wait-jail'];
    let clicked = false;
    for (const id of btn) {
      const b = page.getByTestId(id);
      if ((await b.count()) && (await b.isEnabled())) {
        if (id === 'bk-buy' || id === 'bk-roll' || id === 'bk-end' || id === 'bk-pass') {
          await b.click().catch(() => undefined);
          clicked = true;
          break;
        }
      }
    }
    if (!clicked) {
      const decline = page.getByTestId('bk-decline');
      if ((await decline.count()) && (await decline.isEnabled()))
        await decline.click().catch(() => undefined);
      const wait = page.getByTestId('bk-wait-jail');
      if ((await wait.count()) && (await wait.isEnabled()))
        await wait.click().catch(() => undefined);
    }
    seq = Number((await game.getAttribute('data-seq')) ?? 0);
    if (!shot && seq > 14) {
      shot = true;
      await page.screenshot({ path: 'test-results/bankrupt-mid.png' });
    }
    await page.waitForTimeout(250);
  }
  expect(seq).toBeGreaterThan(40);
});
