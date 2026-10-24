import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  readyAll,
  readyUp,
  newPlayer,
  snapshot,
  takeTurn,
  openLobbySettings,
  leaveLobby,
} from './karma-helpers';

/** Plays my turns (the computer plays its own) until the results are on screen. */
/** Plays until the standings show; returns whether the winner's last-card reveal was seen on the way. */
async function playUntilResults(page: Page, limitMs = 200_000) {
  const started = Date.now();
  let sawWinnerReveal = false;
  const done = async () => page.getByTestId('results-panel').isVisible();
  while (!(await done())) {
    // One evaluate, not count + getAttribute: reveals come and go (every face-down card has one).
    const winner = await page.evaluate(() =>
      document.querySelector('[data-testid=win-reveal]')?.getAttribute('data-winner'),
    );
    if (winner === 'true') sawWinnerReveal = true;
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
  return sawWinnerReveal;
}

test('a game tap opens the lobby: Yatzy can start solo, Karma needs 2 and offers 1-4 computers', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Picker', 'fox');
  const page = me.page;
  const more = page.getByRole('button', { name: 'More Computer players' });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-yatzy').click();
  await expect(page.getByTestId('lobby-ready-count')).toHaveText('Ready 0/1');
  await expect(page.getByTestId('lobby-ready')).toBeEnabled();
  await openLobbySettings(page);
  await expect(more).toHaveCount(0);
  await leaveLobby(page);

  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  await openLobbySettings(page);
  for (let i = 0; i < 4; i++) await more.click();
  await expect(more).toBeDisabled(); // Karma seats at most 5 in total
  await expect(page.getByTestId('lobby-ready-count')).toHaveText('Ready 4/5');
  await leaveLobby(page);
  await me.context.close();
});

test('a whole game against the computer, from one tap to the result, and a rematch', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Solo', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);

  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();

  for (let i = 0; i < 1; i++) await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await readyAll(page);

  // Into the game: the computer sits at the table under its own name.
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
  await expect(panel.locator('h2')).toHaveText(/won!/);

  // Back to lobby: the lobby with the computer still configured, and off we go again.
  await page.getByTestId('results-lobby').click();
  await expect(page.getByTestId('lobby-ready-count')).toHaveText('Ready 1/2');
  await readyAll(page);
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await expect(page.getByTestId('seat-bot:1')).toContainText('Robo');

  // Leaving ends the room (nobody else is in it).
  await page.getByTestId('leave-game').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await expect(page.getByTestId('home-nickname')).toBeVisible();
  await me.context.close();
});

test('a four-player game against three computers ends with the ranking: 1st to 4th, one row each', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Quad', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  for (let i = 0; i < 3; i++) await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await readyAll(page);
  await expect(page.getByTestId('seat-status-bot:3')).toHaveText('Ready ✓', { timeout: 20_000 });
  await readyUp(page);
  await playUntilResults(page);

  // Everybody is ranked, top to bottom, in one list.
  await expect(page.getByTestId('standings').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('rank-1')).toBeVisible();
  await expect(page.getByTestId('rank-2')).toBeVisible();
  await expect(page.getByTestId('rank-3')).toBeVisible();
  await expect(page.getByTestId('rank-4')).toBeVisible();
  await expect(page.getByTestId('results-panel')).toContainText('Quad');
  // Both buttons are reachable on a phone screen.
  await expect(page.getByTestId('results-lobby')).toBeInViewport();
  await expect(page.getByTestId('results-leave')).toBeInViewport();
  await me.context.close();
});

test('with several computers the whole table fills up, each with its own name', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Many', 'fox');
  const page = me.page;
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  for (let i = 0; i < 3; i++) await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await readyAll(page);
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

test('a host can add a computer player in the lobby', async ({ browser }) => {
  const me = await newPlayer(browser, 'Host', 'fox');
  const page = me.page;
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();

  // Karma needs two players: alone it cannot start until a computer is added.
  await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await expect(page.getByTestId('lobby-ready-count')).toHaveText('Ready 1/2');
  await readyAll(page);
  await expect(page.getByTestId('seat-bot:1')).toContainText('Robo');
  await page.getByTestId('leave-game').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await me.context.close();
});

test('Yatzy rooms have no computer setting', async ({ browser }) => {
  const me = await newPlayer(browser, 'Yatzy', 'fox');
  await me.page.getByTestId('home-play').click();
  await me.page.getByTestId('home-game-yatzy').click();
  await expect(me.page.getByRole('button', { name: 'More Computer players' })).toHaveCount(0);
  await leaveLobby(me.page);
  await me.context.close();
});

test('party mode: in round 2 the last winner sets the rules on the round screen, then the game starts', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = await newPlayer(browser, 'Partier', 'fox');
  const page = me.page;
  page.setDefaultTimeout(15_000);
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await page.getByTestId('karma-mode-party').click();
  await expect(page.getByTestId('karma-mode-party')).toHaveAttribute('aria-pressed', 'true');
  await readyAll(page);
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await readyUp(page);
  await playUntilResults(page);

  // "Lobby" goes back to the lobby; Ready starts round 2, which opens with the round screen where
  // the winner of the last game sets the rules (a computer winner just confirms by itself).
  await page.getByTestId('results-lobby').click();
  await readyAll(page);
  const round = page.getByTestId('round-screen');
  const game = page.getByTestId('karma-game');
  await expect(round.or(game.and(page.locator('[data-phase=swap]')))).toBeVisible();
  if (await round.isVisible()) {
    await expect(page.getByTestId('round-title')).toHaveText('Round 2');
    if ((await round.getAttribute('data-mine')) === 'true') {
      await page.getByTestId('round-rule-bigHand').click();
      await expect(page.getByTestId('round-rule-bigHand')).toHaveAttribute('data-active', 'true');
      await page.getByTestId('round-confirm').click();
    }
  }
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await me.context.close();
});

test('epic mode switches on every rule from the start', async ({ browser }) => {
  const me = await newPlayer(browser, 'Epic', 'fox');
  const page = me.page;
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-karma').click();
  await openLobbySettings(page);
  await page.getByRole('button', { name: 'More Computer players' }).click();
  await page.getByTestId('karma-mode-epic').click(); // choosing a mode shows no bubble...
  await expect(page.getByTestId('karma-mode-bubble')).toHaveCount(0);
  await page.getByTestId('karma-mode-epic').click(); // ...tapping the chosen mode again does
  await expect(page.getByTestId('karma-mode-bubble')).toBeVisible();
  await page.getByTestId('karma-rule-echoThree').click();
  await expect(page.getByTestId('karma-rule-bubble')).toContainText('repeats the card beneath');
  await expect(page.getByTestId('karma-active-rules').locator('li')).toHaveCount(3); // no jokers with two seats
  await readyAll(page);
  await expect(page.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.getByTestId('rules-extra').locator('ul > li')).toHaveCount(3);
  await me.context.close();
});
