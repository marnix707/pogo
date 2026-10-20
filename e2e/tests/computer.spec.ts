import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readyUp, newPlayer, snapshot, takeTurn } from './karma-helpers';

/** Plays my turns (the computer plays its own) until the results are on screen. */
/** Plays until the standings show; returns whether the winner's last-card reveal was seen on the way. */
async function playUntilResults(page: Page, limitMs = 200_000) {
  const started = Date.now();
  let sawWinnerReveal = false;
  while (!(await page.getByTestId('results-panel').isVisible())) {
    // One evaluate, not count + getAttribute: reveals come and go (every face-down card has one).
    const winner = await page.evaluate(() =>
      document.querySelector('[data-testid=win-reveal]')?.getAttribute('data-winner'),
    );
    if (winner === 'true') sawWinnerReveal = true;
    if (Date.now() - started > limitMs)
      throw new Error('the game against the computer did not finish');
    // Party mode: the winner of the game picks a rule (the others just wait).
    // (One evaluate: the overlay can vanish between two separate calls.)
    const pick = await page.evaluate(() =>
      document.querySelector('[data-testid=rule-pick]')?.getAttribute('data-mine'),
    );
    if (pick !== undefined && pick !== null) {
      if (pick === 'true')
        await page
          .locator('[data-testid^=rule-choice-]')
          .first()
          .click({ timeout: 3000 })
          .catch(() => {});
      else await page.waitForTimeout(100);
      continue;
    }
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
  return sawWinnerReveal;
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

  const sawWinnerReveal = await playUntilResults(page);

  // Both of us are in the standings, and the headline says who came last.
  const panel = page.getByTestId('results-panel');
  await expect(panel).toContainText('Robo');
  await expect(panel).toContainText('Solo');
  await expect(page.getByTestId('rank-1')).toBeVisible();
  // The burn flame (🔥 over the pile) is a short animation; it must never stay stuck on screen.
  await expect(page.getByTestId('burn-flash')).toHaveCount(0, { timeout: 5000 });
  // Whoever went out first got the last-card reveal with confetti, and it was done before the
  // standings covered the screen.
  expect(sawWinnerReveal).toBe(true);
  await expect(page.getByTestId('win-reveal')).toHaveCount(0);
  await expect(page.getByTestId('rank-2')).toBeVisible();
  await expect(panel.locator('h2')).toHaveText(/Karma got you|Robo is last/);

  // Back to lobby: the waiting room with the computer still configured, and off we go again.
  await page.getByTestId('back-to-lobby').click();
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

test('party mode: the winner picks a rule that applies to the next game; epic has every rule', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Partier', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await page.getByTestId('home-game-karma').click();
  await page.getByTestId('home-new-karma').click();
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await page.getByTestId('karma-mode-party').click();
  await expect(page.getByTestId('karma-mode-party')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await readyUp(page);
  await playUntilResults(page);

  // "Play again" starts the next game at once, with the rule the winner switched on.
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.getByTestId('rules-extra').locator('ul > li')).toHaveCount(1);
  await me.context.close();
});

test('epic mode switches on every rule from the start', async ({ browser }) => {
  const me = await newPlayer(browser, 'Epic', 'fox');
  const page = me.page;
  await page.getByTestId('home-game-karma').click();
  await page.getByTestId('home-new-karma').click();
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await page.getByTestId('karma-mode-epic').click();
  await expect(page.getByTestId('karma-mode-bubble')).toContainText('Big hand');
  await expect(page.getByTestId('karma-mode-bubble')).toContainText('3 ate 9');
  await expect(page.getByTestId('karma-active-rules').locator('li')).toHaveCount(2);
  await page.getByTestId('lobby-start').click();
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.getByTestId('rules-extra').locator('ul > li')).toHaveCount(2);
  await me.context.close();
});
