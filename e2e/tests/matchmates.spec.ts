import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

const COLS = 8;

/** Finds a swap that lines up three of a kind from the cell kinds shown on the board (right and down neighbours). */
function findSwap(kinds: string[]): [number, number] | null {
  const matches = (k: string[]) => {
    for (let r = 0; r < COLS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const kind = k[i]!;
        if (kind === 'bomb' || kind === 'mystery') continue;
        if (c + 2 < COLS && k[i + 1] === kind && k[i + 2] === kind) return true;
        if (r + 2 < COLS && k[i + COLS] === kind && k[i + 2 * COLS] === kind) return true;
      }
    return false;
  };
  for (let r = 0; r < COLS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      for (const j of [c + 1 < COLS ? i + 1 : -1, r + 1 < COLS ? i + COLS : -1]) {
        if (j < 0) continue;
        const k = [...kinds];
        [k[i], k[j]] = [k[j]!, k[i]!];
        if (matches(k)) return [i, j];
      }
    }
  return null;
}

test('Match Mates: pick, play moves against the computer', async ({ browser }) => {
  test.setTimeout(120_000);
  const me = await newPlayer(browser, 'Tamer', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-matchmates').click();
  const button = page.getByTestId('lobby-ready');
  await expect(button).toHaveAttribute('data-mode', 'add-robo');
  await button.click();
  await button.click();
  await expect(page.getByTestId('mates-pick')).toBeVisible();
  await page.getByTestId('mates-pick-fire').click();
  await page.getByTestId('mates-pick-water').click();
  await page.getByTestId('mates-stage-lava').click();
  await page.screenshot({ path: 'test-results/mates-1-pick.png' });
  await page.getByTestId('mates-ready').click();
  await expect(page.getByTestId('mates-game')).toHaveAttribute('data-phase', 'play');
  await page.screenshot({ path: 'test-results/mates-2-board.png' });

  // Play a few of my moves; the computer answers in between.
  for (let n = 0; n < 4; n++) {
    await expect(page.getByTestId('mates-turn')).toHaveText('Your turn', { timeout: 60_000 });
    const kinds = await page
      .locator('[data-testid^=mates-cell-]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-kind') ?? ''));
    const swap = findSwap(kinds);
    expect(swap).not.toBeNull();
    await page.getByTestId(`mates-cell-${swap![0]}`).click();
    await page.getByTestId(`mates-cell-${swap![1]}`).click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: 'test-results/mates-3-after.png' });
  await me.context.close();
});
