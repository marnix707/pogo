import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readyUp, newPlayer, snapshot, takeTurn } from './karma-helpers';

/** Plays my turns (the computer plays its own) until the results are on screen. */
async function playUntilResults(page: Page, limitMs = 200_000) {
  const started = Date.now();
  while (!(await page.getByTestId('results-panel').isVisible())) {
    if (Date.now() - started > limitMs)
      throw new Error('the game against the computer did not finish');
    // A burn flame must go away by itself (it once got stuck for the rest of the game).
    if (await page.getByTestId('burn-flash').isVisible())
      await expect(page.getByTestId('burn-flash')).toHaveCount(0, { timeout: 4000 });
    const s = await snapshot(page);
    if (!s.myTurn) {
      await page.waitForTimeout(60); // the computer is thinking
      continue;
    }
    await takeTurn(page, s);
    await expect
      .poll(async () => (await snapshot(page)).event, { timeout: 10_000 })
      .not.toBe(s.event);
  }
}

test('Karma offers "Play the computer" with 1-4 opponents; Yatzy does not', async ({ browser }) => {
  const me = await newPlayer(browser, 'Picker', 'fox');
  const page = me.page;
  await page.getByTestId('home-game-yatzy').click();
  await expect(page.getByTestId('home-new-yatzy')).toBeVisible();
  await expect(page.getByTestId('home-computer-yatzy')).toHaveCount(0);
  await page.getByTestId('sheet-backdrop').click({ position: { x: 5, y: 5 } }); // tap outside: closes
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0);

  await page.getByTestId('home-game-karma').click();
  await expect(page.getByTestId('home-computer-karma')).toBeVisible();
  await page.getByTestId('home-computer-karma').click();
  for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`computer-count-${n}`)).toBeVisible();
  await expect(page.getByTestId('computer-count-5')).toHaveCount(0); // Karma seats at most 5 in total
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('computer-count-1')).toHaveCount(0);
  await me.context.close();
});

test('a whole game against the computer, from one tap to the result, and a rematch', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Solo', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);

  await page.getByTestId('home-game-karma').click();

  await page.getByTestId('home-computer-karma').click();
  await page.getByTestId('computer-count-1').click();

  // Straight into the game: the computer sits at the table under its own name.
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  const seat = page.getByTestId('seat-bot:1');
  await expect(seat).toContainText('Robo');
  // It arranges its table and gets ready by itself (no one presses anything for it).
  await expect(page.getByTestId('seat-status-bot:1')).toHaveText('Ready ✓', { timeout: 20_000 });

  await readyUp(page);
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');

  await playUntilResults(page);

  // Both of us are in the standings, and the headline says who came last.
  const panel = page.getByTestId('results-panel');
  await expect(panel).toContainText('Robo');
  await expect(panel).toContainText('Solo');
  await expect(page.getByTestId('rank-1')).toBeVisible();
  // The burn flame (🔥 over the pile) is a short animation; it must never stay stuck on screen.
  await expect(page.getByTestId('burn-flash')).toHaveCount(0, { timeout: 5000 });
  // Whoever went out first got the last-card reveal with confetti (it lets taps through).
  await expect(page.getByTestId('win-reveal')).toHaveAttribute('data-winner', 'true');
  await expect(page.getByTestId('rank-2')).toBeVisible();
  await expect(panel.locator('h2')).toHaveText(/Karma got you|Robo is last/);

  // Rematch: back to the waiting room with the computer still configured, and off we go again.
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('lobby-start')).toHaveText('Start vs computer');
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await expect(page.getByTestId('seat-bot:1')).toContainText('Robo');

  // Leaving ends the room (nobody else is in it).
  await page.getByTestId('leave-game').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await expect(page.getByTestId('home-nickname')).toBeVisible();
  await me.context.close();
});

test('a four-player game against three computers ends with a podium: 1st, 2nd, 3rd and the rest in a list', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Quad', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await page.getByTestId('home-game-karma').click();
  await page.getByTestId('home-computer-karma').click();
  await page.getByTestId('computer-count-3').click();
  await expect(page.getByTestId('seat-status-bot:3')).toHaveText('Ready ✓', { timeout: 20_000 });
  await readyUp(page);
  await playUntilResults(page);

  // Everybody is ranked: the top three stand on the podium (2nd, 1st, 3rd from left to right).
  const podium = page.getByTestId('podium');
  await expect(podium).toBeVisible();
  await expect(podium.locator('[data-place]')).toHaveCount(3);
  await expect(page.getByTestId('rank-1')).toBeVisible();
  await expect(page.getByTestId('rank-2')).toBeVisible();
  await expect(page.getByTestId('rank-3')).toBeVisible();
  await expect(page.getByTestId('rank-4')).toBeVisible(); // 4th is in the list under the podium
  await expect(page.getByTestId('results-panel')).toContainText('Quad');
  // Both buttons are reachable on a phone screen.
  await expect(page.getByTestId('rematch')).toBeInViewport();
  await expect(page.getByTestId('results-leave')).toBeInViewport();
  await me.context.close();
});

test('with several computers the whole table fills up, each with its own name', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Many', 'fox');
  const page = me.page;
  await page.getByTestId('home-game-karma').click();
  await page.getByTestId('home-computer-karma').click();
  await page.getByTestId('computer-count-3').click();
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  for (const [i, name] of ['Robo', 'Bolt', 'Pixel'].entries()) {
    await expect(page.getByTestId(`seat-bot:${i + 1}`)).toContainText(name);
  }
  // Their hands are private: only my own cards are in the page.
  expect(await page.locator('[data-testid^=hand-card-]').count()).toBe(3);
  await page.getByTestId('leave-game').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await me.context.close();
});

test('a host can add a computer player in the waiting room', async ({ browser }) => {
  const me = await newPlayer(browser, 'Host', 'fox');
  const page = me.page;
  await page.getByTestId('home-game-karma').click();
  await page.getByTestId('home-new-karma').click();

  // Karma needs two players; alone it cannot start...
  await expect(page.getByTestId('lobby-start')).toBeDisabled();
  await expect(page.getByTestId('lobby-start')).toContainText('Need 2 players');
  // ...until a computer is added.
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await expect(page.getByTestId('lobby-start')).toHaveText('Start vs computer');
  await expect(page.getByTestId('lobby-start')).toBeEnabled();
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('seat-bot:1')).toContainText('Robo');
  await page.getByTestId('leave-game').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await me.context.close();
});

test('Yatzy rooms have no computer setting', async ({ browser }) => {
  const me = await newPlayer(browser, 'Yatzy', 'fox');
  await me.page.getByTestId('home-game-yatzy').click();
  await me.page.getByTestId('home-new-yatzy').click();
  await expect(me.page.getByRole('button', { name: 'More Computer players' })).toHaveCount(0);
  await me.page.getByTestId('lobby-leave').click();
  await me.context.close();
});
