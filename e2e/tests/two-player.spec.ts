import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { readyAll } from './karma-helpers';

async function newPlayer(browser: Browser, nickname: string, avatar: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill(nickname);
  await page.getByRole('button', { name: avatar, exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText(nickname);
  return { context, page };
}

/** Plays one full turn: roll once, then score the first category the UI offers. */
async function playTurn(page: Page) {
  await page.getByTestId('roll-button').click();
  await expect(page.getByTestId('die-0')).not.toHaveAttribute('data-value', '0');
  const firstChoice = page.locator('[data-testid^="pick-"]').first();
  await expect(firstChoice).not.toHaveText('?'); // the points show once the dice stopped rolling
  await firstChoice.click();
  await page.getByTestId('score-button').click();
}

test('two players play a full Yatzy game, with a reconnect in the middle', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];

  // Alice creates a room; Bob joins with the code.
  await a.getByTestId('home-play').click();
  await a.getByTestId('home-game-yatzy').click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  await b.getByTestId('home-join').click();
  await b.getByTestId('home-join-code').fill(code);
  await b.getByTestId('home-join-submit').click();
  await expect(b.getByTestId('member-Alice')).toBeVisible();
  await expect(a.getByTestId('player-count')).toHaveText('2 / 6');
  await expect(a.getByTestId('member-Bob')).toBeVisible();

  // Nobody starts by hand: the game starts by itself once both are ready (after a countdown).
  await a.getByTestId('lobby-ready').click();
  await expect(a.getByTestId('lobby-ready-count')).toHaveText('Ready 1/2');
  await expect(b.getByTestId('member-Alice')).toContainText('Ready');
  await b.getByTestId('lobby-ready').click();
  await expect(a.getByTestId('lobby-countdown')).toBeVisible();
  await expect(a.getByTestId('turn-banner')).toBeVisible({ timeout: 15_000 });
  await expect(a.getByTestId('turn-banner')).toHaveAttribute('data-my-turn', 'true');
  await expect(b.getByTestId('turn-banner')).toHaveAttribute('data-my-turn', 'false');
  await expect(b.getByTestId('turn-banner')).toContainText("Alice's turn");
  await expect(b.getByTestId('roll-button')).toHaveCount(0);

  // Holding a die keeps its value across the next roll; Bob sees the same dice.
  await a.getByTestId('roll-button').click();
  await expect(a.getByTestId('die-0')).not.toHaveAttribute('data-value', '0');
  const held = await a.getByTestId('die-0').getAttribute('data-value');
  await a.getByTestId('die-0').click();
  await expect(a.getByTestId('die-0')).toHaveAttribute('aria-pressed', 'true');
  await expect(b.getByTestId('die-0')).toHaveAttribute('data-value', held!);
  // Bob sees what Alice could score, in small grey type in her column (never on his own turn).
  await expect(b.locator('[data-testid^=hint-]').first()).toBeVisible();
  await expect(a.locator('[data-testid^=hint-]')).toHaveCount(0);
  await a.getByTestId('roll-button').click();
  await expect(a.getByTestId('rolls-used')).toHaveText('2');
  await expect(a.getByTestId('die-0')).toHaveAttribute('data-value', held!);
  await expect(b.getByTestId('die-0')).toHaveAttribute('data-value', held!);

  // Alice finishes her turn; it becomes Bob's.
  await expect(a.locator('[data-testid^="pick-"]').first()).not.toHaveText('?');
  await a.locator('[data-testid^="pick-"]').first().click();
  await a.getByTestId('score-button').click();
  await expect(b.getByTestId('turn-banner')).toHaveAttribute('data-my-turn', 'true');

  // Bob's phone refreshes mid-turn: he lands straight back in the game, still his turn.
  await b.reload();
  await expect(b.getByTestId('turn-banner')).toHaveAttribute('data-my-turn', 'true');
  await playTurn(b);

  // Play the rest of the game: 24 more turns, alternating Alice (even) and Bob (odd).
  for (let turn = 2; turn < 26; turn++) {
    const page = turn % 2 === 0 ? a : b;
    await expect(page.getByTestId('turn-banner')).toHaveAttribute('data-my-turn', 'true');
    await playTurn(page);
  }

  // Both players see the same final standings.
  for (const page of [a, b]) {
    await expect(page.getByTestId('results-panel')).toBeVisible();
    // Ties share rank 1, so there can be more than one.
    await expect(page.getByTestId('rank-1').first()).toBeVisible();
    await expect(page.getByTestId('results-panel')).toContainText('Alice');
    await expect(page.getByTestId('results-panel')).toContainText('Bob');
  }
  const scoreOf = async (page: Page, rank: number) =>
    (await page.getByTestId(`rank-${rank}`).first().locator('span').last().textContent())!;
  expect(await scoreOf(a, 1)).toBe(await scoreOf(b, 1));

  // Rematch returns both to the lobby.
  await a.getByTestId('rematch').click();
  await expect(a.getByTestId('lobby-ready')).toBeVisible();
  await expect(b.getByTestId('lobby-ready')).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});

test('a share link joins the room directly, and the host can remove a player', async ({
  browser,
}) => {
  const host = await newPlayer(browser, 'Hana', 'owl');
  await host.page.getByTestId('home-play').click();
  await host.page.getByTestId('home-game-yatzy').click();
  const code = (await host.page.getByTestId('room-code').textContent())!.trim();

  // A brand new visitor opens the invite link, signs in, and ends up in the room.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/?join=${code}`);
  await guest.getByTestId('signin-nickname').fill('Gus');
  await guest.getByTestId('signin-submit').click();
  await expect(guest.getByTestId('room-code')).toHaveText(code);
  await expect(host.page.getByTestId('member-Gus')).toBeVisible();

  await host.page.getByTestId('member-Gus').getByRole('button', { name: 'Remove' }).click();
  await expect(guest.getByTestId('home-play')).toBeVisible();
  await expect(guest.getByTestId('toast')).toContainText('removed');

  await host.context.close();
  await guestContext.close();
});

test('the Yatzy scorecard, dice and buttons fit one phone screen without vertical scrolling', async ({
  browser,
}) => {
  // 390x700 is a typical phone browser window (portrait, with the browser bars showing).
  const context = await browser.newContext({
    viewport: { width: 390, height: 700 },
    reducedMotion: 'reduce',
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Solo');
  await page.getByTestId('signin-submit').click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-game-yatzy').click();
  await readyAll(page);
  await page.getByTestId('roll-button').click();
  await expect(page.getByTestId('die-0')).not.toHaveAttribute('data-value', '0');

  const overflow = await page.evaluate(() => {
    const scroller = document
      .querySelector('[data-testid=scorecard]')!
      .closest('.overflow-y-auto')!;
    return scroller.scrollHeight - scroller.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  // The Total row and the action buttons are both on screen at once.
  await expect(page.getByTestId('scorecard').getByText('Total')).toBeInViewport();
  await expect(page.getByTestId('roll-button')).toBeInViewport();

  await context.close();
});
