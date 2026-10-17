import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

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

// Cards in the fanned hand overlap, so tap the visible left strip, like a thumb would.
const STRIP = { position: { x: 6, y: 14 } };

interface Snapshot {
  myTurn: boolean;
  event: string;
  handCount: number;
  playableHand: { id: string; rank: number }[];
  playableUp: { id: string; rank: number }[];
  hasUp: boolean;
  downs: string[];
}

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const q = (sel: string) => [...document.querySelectorAll(sel)];
    const rank = (el: Element) => Number(el.getAttribute('data-rank'));
    const turn = document.querySelector('[data-testid=karma-hint]');
    return {
      myTurn: turn?.getAttribute('data-my-turn') === 'true',
      event: document.querySelector('[data-testid=karma-event]')?.textContent ?? '',
      handCount: q('[data-testid^=hand-card-]').length,
      playableHand: q('[data-testid^=hand-card-][data-playable=true]').map((e) => ({
        id: e.getAttribute('data-testid')!,
        rank: rank(e),
      })),
      playableUp: q('[data-testid^=my-up-][data-playable=true]').map((e) => ({
        id: e.getAttribute('data-testid')!,
        rank: Number(e.getAttribute('aria-label')?.match(/^\d+|^[JQKA]/)?.[0] ?? 0),
      })),
      hasUp: q('[data-testid^=my-up-]').length > 0,
      downs: q('[data-testid^=my-down-]').map((e) => e.getAttribute('data-testid')!),
    };
  });

/** One sensible move through the real UI: lowest playable card, else pick up; blind cards at the end. */
async function takeTurn(page: Page, s: Snapshot) {
  const lowest = <T extends { rank: number }>(cards: T[]) =>
    // keep 2s and 10s for when they are needed
    [...cards].sort(
      (a, b) =>
        (a.rank === 2 || a.rank === 10 ? 100 : a.rank) -
        (b.rank === 2 || b.rank === 10 ? 100 : b.rank),
    )[0];

  if (s.handCount > 0) {
    const card = lowest(s.playableHand);
    if (!card) return page.getByTestId('karma-pickup').click();
    await page.getByTestId(card.id).click(STRIP);
  } else if (s.hasUp) {
    const card = lowest(s.playableUp);
    if (!card) return page.getByTestId('karma-pickup').click();
    await page.getByTestId(card.id).click();
  } else {
    await page.getByTestId(s.downs[0]!).click();
  }
  await page.getByTestId('karma-play').click();
}

test('three players play a complete Karma game through the UI', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const cleo = await newPlayer(browser, 'Cleo', 'panda');
  const pages = [alice.page, bob.page, cleo.page];

  // Karma sits next to Yatzy on the home screen; Alice opens a private Karma room.
  await alice.page.getByTestId('home-new-karma').click();
  const code = (await alice.page.getByTestId('room-code').textContent())!.trim();
  for (const p of [bob.page, cleo.page]) {
    await p.getByTestId('home-join-code').fill(code);
    await p.getByTestId('home-join-submit').click();
  }
  await expect(alice.page.getByTestId('player-count')).toHaveText('3 / 5');
  await alice.page.getByTestId('lobby-start').click();

  // Swap phase: everyone acts at once. Alice swaps a hand card with a face-up card, then all get ready.
  for (const p of pages)
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  const upBefore = await alice.page.getByTestId('my-up-0').getAttribute('aria-label');
  await alice.page.locator('[data-testid^=hand-card-]').first().click(STRIP);
  await alice.page.getByTestId('my-up-0').click();
  await expect(alice.page.getByTestId('my-up-0')).not.toHaveAttribute('aria-label', upBefore!);
  for (const p of pages) await p.getByTestId('karma-ready').click();
  for (const p of pages)
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');

  // Play until the results appear, always letting whoever's turn it is move.
  let moves = 0;
  const done = () => alice.page.getByTestId('results-panel').isVisible();
  while (!(await done())) {
    if (moves++ > 1500) throw new Error('the game did not finish');
    let acted = false;
    for (const page of pages) {
      const s = await snapshot(page);
      if (!s.myTurn) continue;
      await takeTurn(page, s);
      await expect
        .poll(async () => (await snapshot(page)).event, { timeout: 10_000 })
        .not.toBe(s.event);
      acted = true;
      break;
    }
    if (!acted) await alice.page.waitForTimeout(50);
  }

  // Everybody sees the same standings, and exactly one player is told they are last.
  for (const p of pages) {
    await expect(p.getByTestId('results-panel')).toBeVisible();
    await expect(p.getByTestId('rank-1')).toBeVisible();
    await expect(p.getByTestId('rank-2')).toBeVisible();
    await expect(p.getByTestId('rank-3')).toBeVisible();
  }
  const headlines = await Promise.all(
    pages.map((p) => p.getByTestId('results-panel').locator('h2').textContent()),
  );
  expect(headlines.filter((h) => h?.includes('Karma got you'))).toHaveLength(1);
  expect(headlines.filter((h) => h?.includes('is last'))).toHaveLength(2);

  // Rematch goes back to the waiting room.
  await alice.page.getByTestId('rematch').click();
  await expect(alice.page.getByTestId('lobby-start')).toBeVisible();

  for (const c of [alice, bob, cleo]) await c.context.close();
});

test('the lobby can be filtered by game', async ({ browser }) => {
  const watcher = await newPlayer(browser, 'Filterer', 'owl');
  const hostA = await newPlayer(browser, 'KarmaHost', 'fox');
  const hostB = await newPlayer(browser, 'YatzyHost', 'cat');

  await hostA.page.getByTestId('home-quick-karma').click();
  await expect(hostA.page.getByTestId('room-visibility')).toHaveText('Public');
  await hostB.page.getByTestId('home-quick-yatzy').click();

  const w = watcher.page;
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "KarmaHost's game" })).toBeVisible();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "YatzyHost's game" })).toBeVisible();

  await w.getByRole('button', { name: 'Karma', exact: true }).click();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "KarmaHost's game" })).toBeVisible();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "YatzyHost's game" })).toHaveCount(0);

  await w.getByRole('button', { name: 'Yatzy', exact: true }).click();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "YatzyHost's game" })).toBeVisible();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "KarmaHost's game" })).toHaveCount(0);

  // Leave the rooms so they do not linger in the shared lobby for other tests.
  await hostA.page.getByTestId('lobby-leave').click();
  await hostB.page.getByTestId('lobby-leave').click();
  await w.getByRole('button', { name: 'All', exact: true }).click();
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "KarmaHost's game" })).toHaveCount(0);
  await expect(w.getByTestId(/^open-game-/).filter({ hasText: "YatzyHost's game" })).toHaveCount(0);

  for (const c of [watcher, hostA, hostB]) await c.context.close();
});
