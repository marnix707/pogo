import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

const COLS = 7;
const ROWS = 5;

/** Finds a swap that lines up three of a kind from the cell kinds shown on the board (right and down neighbours). */
function findSwap(kinds: string[]): [number, number] | null {
  const matches = (k: string[]) => {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const kind = k[i]!;
        if (kind === 'bomb' || kind === 'mystery') continue;
        if (c + 2 < COLS && k[i + 1] === kind && k[i + 2] === kind) return true;
        if (r + 2 < ROWS && k[i + COLS] === kind && k[i + 2 * COLS] === kind) return true;
      }
    return false;
  };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      for (const j of [c + 1 < COLS ? i + 1 : -1, r + 1 < ROWS ? i + COLS : -1]) {
        if (j < 0) continue;
        const k = [...kinds];
        [k[i], k[j]] = [k[j]!, k[i]!];
        if (matches(k)) return [i, j];
      }
    }
  return null;
}

test('Pet Match: pick, play moves against the computer', async ({ browser }) => {
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
  // The draft: whoever is up takes a pet (Robo answers by itself); then the arena and Confirm.
  const game = page.getByTestId('mates-game');
  for (let n = 0; n < 40 && (await game.getAttribute('data-phase')) === 'pick'; n++) {
    if (await page.getByTestId('mates-ready').isVisible()) {
      await page.getByTestId('mates-stage-lava').click();
      await page.screenshot({ path: 'test-results/mates-1-arena.png' });
      await page.getByTestId('mates-ready').click();
      break;
    }
    const open = page.locator('[data-testid^=mates-pick-]:enabled');
    if ((await open.count()) > 0) {
      await page.screenshot({ path: 'test-results/mates-1-draft.png' });
      await open.first().click();
      await page.getByTestId('mates-draft-confirm').click();
    }
    await page.waitForTimeout(1500);
  }
  await expect(game).toHaveAttribute('data-phase', 'play', { timeout: 30_000 });
  await expect(page.getByTestId('mates-coin')).toBeVisible();
  await page.screenshot({ path: 'test-results/mates-2-coin.png' });
  await expect(page.getByTestId('mates-coin')).toHaveCount(0, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/mates-2-board.png' });
  // Tapping one of my pets opens its pop-up: both forms, and an Evolve button that is greyed out without berries.
  await page.getByTestId('mates-monster-me-0').click();
  await expect(page.getByTestId('mates-pet-info')).toBeVisible();
  await expect(page.getByTestId('mates-pet-action')).toBeDisabled();
  await page.getByTestId('mates-pet-form-1').click();
  await page.screenshot({ path: 'test-results/mates-2-petinfo.png' });
  await page.mouse.click(4, 4); // anywhere outside closes it
  await expect(page.getByTestId('mates-pet-info')).toHaveCount(0);

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
