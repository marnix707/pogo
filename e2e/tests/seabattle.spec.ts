import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newPlayer } from './karma-helpers';

/** Lobby: open Sea Battle and let the host add a Robo with the button, then Start. */
async function startAgainstRobo(page: Page) {
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-seabattle').click();
  const button = page.getByTestId('lobby-ready');
  await expect(button).toHaveAttribute('data-mode', 'add-robo');
  await button.click(); // adds the computer
  await expect(button).toHaveAttribute('data-mode', 'ready');
  await expect(page.getByTestId('lobby-ready-count')).toHaveText('Start');
  await button.click(); // alone with a computer: starts at once
  await expect(page.getByTestId('seabattle-game')).toHaveAttribute('data-phase', 'place');
}

test('Sea Battle: place, ready, the coin decides, play against the computer to the end', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Admiral', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await startAgainstRobo(page);

  // Placing: a random fleet is already on the board; Random shuffles, Play locks it in.
  await expect(page.getByTestId('sb-place-board')).toBeVisible();
  await expect(page.locator('[data-testid^=sb-ship-]')).toHaveCount(5);
  await page.getByTestId('sb-random').click();
  await page.getByTestId('sb-ready').click();

  // The coin flip decides who starts, then the battle.
  await expect(page.getByTestId('seabattle-game')).toHaveAttribute('data-phase', 'play');
  await expect(page.getByTestId('sb-coin')).toBeVisible();
  await expect(page.getByTestId('sb-coin')).toHaveCount(0, { timeout: 10_000 });

  // Fire at every square in turn until the game is over.
  const order: [number, number][] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) order.push([x, y]);
  const results = page.getByTestId('results-panel');
  // Whoever fires the last shot, the radar shows up: grab a picture of it.
  const radarShot = page
    .getByTestId('sb-radar')
    .waitFor({ timeout: 250_000 })
    .then(async () => {
      await page.waitForTimeout(2200);
      await page.screenshot({ path: 'test-results/sb-6-radar.png' });
    })
    .catch(() => undefined);
  for (const [x, y] of order) {
    if (await results.isVisible()) break;
    // Wait for my turn (the computer thinks, the bombs fall).
    // (The squares are only buttons while it is my turn and no bomb is falling.)
    const turn = page.getByTestId('sb-cell-0-0').or(results);
    await turn.waitFor({ timeout: 60_000 });
    if (await results.isVisible()) break;
    if (
      (await page.getByTestId(`sb-hit-${x}-${y}`).count()) +
        (await page.getByTestId(`sb-miss-${x}-${y}`).count()) >
      0
    )
      continue;
    const before = await page.getByTestId('sb-event').getAttribute('data-seq');
    await page.getByTestId(`sb-cell-${x}-${y}`).click(); // one tap fires
    await expect
      .poll(async () => page.getByTestId('sb-event').getAttribute('data-seq'), { timeout: 10_000 })
      .not.toBe(before);
  }

  // The radar shows the ships nobody found (if I lost), then the standings.
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('rank-1')).toBeVisible();
  await radarShot;
  await me.context.close();
});

test('Sea Battle placing: a tap turns a ship around its middle, dragging really moves it', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Placer', 'cat');
  const page = me.page;
  await startAgainstRobo(page);
  const board = page.getByTestId('sb-place-board');
  const box = (await board.boundingBox())!;
  const cell = box.width / 10;
  const destroyer = page.getByTestId('sb-ship-destroyer');
  const centre = (b: { x: number; y: number; width: number; height: number }) => ({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
  });

  // A tap turns the ship: its long side swaps and its middle stays (within half a cell).
  let turnedOnce = false;
  for (let attempt = 0; attempt < 6 && !turnedOnce; attempt++) {
    const before = (await destroyer.boundingBox())!;
    await page.mouse.click(before.x + cell / 2, before.y + cell / 2);
    const after = (await destroyer.boundingBox())!;
    if (Math.abs(after.width - before.width) > 2) {
      turnedOnce = true;
      expect(Math.abs(centre(after).x - centre(before).x)).toBeLessThanOrEqual(cell / 2 + 1);
      expect(Math.abs(centre(after).y - centre(before).y)).toBeLessThanOrEqual(cell / 2 + 1);
    } else await page.getByTestId('sb-random').click();
  }
  expect(turnedOnce).toBe(true);

  // Dragging: put the destroyer in the bottom-right corner (retry with a new layout if that is taken).
  let moved = false;
  for (let attempt = 0; attempt < 6 && !moved; attempt++) {
    const now = (await destroyer.boundingBox())!;
    await page.mouse.move(now.x + cell / 2, now.y + cell / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 9.5 * cell, box.y + 9.5 * cell, { steps: 10 });
    await page.mouse.up();
    const dropped = (await destroyer.boundingBox())!;
    moved =
      Math.abs(dropped.y + dropped.height - (box.y + box.height)) < 5 &&
      Math.abs(dropped.x + dropped.width - (box.x + box.width)) < 5;
    if (!moved) await page.getByTestId('sb-random').click();
  }
  expect(moved).toBe(true);
  await me.context.close();
});

test('Sea Battle looks (real motion, screenshots in test-results)', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Looker');
  await page.getByRole('button', { name: 'fox', exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText('Looker');
  await startAgainstRobo(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/sb-1-place.png' });
  await page.getByTestId('sb-ready').click();
  await expect(page.getByTestId('sb-coin')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/sb-2-coin-flying.png' });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'test-results/sb-3-coin-landed.png' });
  await expect(page.getByTestId('sb-coin')).toHaveCount(0, { timeout: 8000 });
  // Fire at a few squares and catch the bomb mid-air.
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('sb-cell-0-0').waitFor({ timeout: 30_000 });
    await page.getByTestId(`sb-cell-${i + 2}-${i + 3}`).click();
    if (i === 2) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/sb-4-bomb.png' });
    }
    await page.waitForTimeout(2600);
  }
  await page.screenshot({ path: 'test-results/sb-5-play.png' });
  await context.close();
});

test('Sea Battle sinking animation (real motion, screenshot in test-results)', async ({
  browser,
}) => {
  test.setTimeout(280_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Sinker');
  await page.getByRole('button', { name: 'fox', exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText('Sinker');
  await startAgainstRobo(page);
  await page.getByTestId('sb-ready').click();
  await expect(page.getByTestId('sb-coin')).toHaveCount(0, { timeout: 12_000 });
  // Shoot every second square (any ship of two or more squares is found) until something goes down.
  let caught = false;
  for (let i = 0; i < 100 && !caught; i++) {
    const x = ((i * 2) % 10) + (Math.floor((i * 2) / 10) % 2);
    const y = Math.floor((i * 2) / 10);
    if (y > 9) break;
    await page.getByTestId('sb-cell-0-0').waitFor({ timeout: 40_000 });
    if ((await page.getByTestId(`sb-cell-${x}-${y}`).count()) === 0) continue;
    await page.getByTestId(`sb-cell-${x}-${y}`).click();
    caught = await page
      .getByTestId('sb-sinking')
      .waitFor({ timeout: 3600 })
      .then(() => true)
      .catch(() => false);
    if (caught) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/sb-7-sinking.png' });
    }
  }
  await context.close();
});
