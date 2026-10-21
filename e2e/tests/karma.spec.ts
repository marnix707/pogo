import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { STRIP, readyUp, newPlayer, snapshot, takeTurn } from './karma-helpers';

test('three players play a complete Karma game through the UI', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const cleo = await newPlayer(browser, 'Cleo', 'panda');
  const pages = [alice.page, bob.page, cleo.page];
  for (const p of pages) p.setDefaultTimeout(15_000); // a stuck click fails fast with a clear error

  // Karma sits next to Yatzy on the home screen; Alice opens a private Karma room.
  await alice.page.getByTestId('home-game-karma').click();
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
  for (const p of pages) await readyUp(p);
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

  // "Back to lobby" goes back to the lobby ("Play again" restarts at once).
  await alice.page.getByTestId('back-to-lobby').click();
  await expect(alice.page.getByTestId('lobby-start')).toBeVisible();

  for (const c of [alice, bob, cleo]) await c.context.close();
});

/** Mirrors handRowsFor in KarmaGame.tsx. */
const rowsFor = (n: number) => (n <= 8 ? 1 : n <= 12 ? 2 : Math.max(3, Math.ceil(n / 8)));

test('the lobby can be filtered by game', async ({ browser }) => {
  const watcher = await newPlayer(browser, 'Filterer', 'owl');
  const hostA = await newPlayer(browser, 'KarmaHost', 'fox');
  const hostB = await newPlayer(browser, 'YatzyHost', 'cat');

  await hostA.page.getByTestId('home-game-karma').click();

  await expect(hostA.page.getByTestId('room-visibility')).toHaveText('Public');
  await hostB.page.getByTestId('home-game-yatzy').click();
  await expect(hostB.page.getByTestId('room-visibility')).toHaveText('Public');

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

/** Resolves true if the element gets a running animation within ~1.5s (polling every frame). */
const animatesSoon = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      new Promise<boolean>((resolve) => {
        let frames = 0;
        const check = () => {
          const el = document.querySelector(sel);
          if (el && el.getAnimations().length > 0) return resolve(true);
          if (++frames > 90) return resolve(false);
          requestAnimationFrame(check);
        };
        check();
      }),
    selector,
  );

test('cards slide when swapped and when played to the pile (unless motion is reduced)', async ({
  browser,
}) => {
  // The suite runs with reduced motion; this test wants the real thing.
  const make = async (name: string, avatar: string, reduce: 'reduce' | 'no-preference') => {
    const context = await browser.newContext({ reducedMotion: reduce });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('signin-nickname').fill(name);
    await page.getByRole('button', { name: avatar, exact: true }).click();
    await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('home-nickname')).toHaveText(name);
    return { context, page };
  };
  const alice = await make('Alice', 'fox', 'no-preference');
  const bob = await make('Bob', 'cat', 'no-preference');
  const calm = await make('Calm', 'owl', 'reduce'); // reduced motion: must not animate
  const pages = [alice.page, bob.page, calm.page];

  await alice.page.getByTestId('home-game-karma').click();

  const code = (await alice.page.getByTestId('room-code').textContent())!.trim();
  for (const p of [bob.page, calm.page]) {
    await p.getByTestId('home-join-code').fill(code);
    await p.getByTestId('home-join-submit').click();
  }
  await alice.page.getByTestId('lobby-start').click();
  for (const p of pages)
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await alice.page.waitForTimeout(300); // let the "first paint, no animation" window pass

  // Swapping: the two cards trade places by sliding.
  await alice.page.locator('[data-testid^=hand-card-]').first().click(STRIP);
  await alice.page.getByTestId('my-up-0').click();
  expect(await animatesSoon(alice.page, '[data-testid=my-up-0]')).toBe(true);
  // ...but not for the player who asked for reduced motion (they just swap instantly).
  await calm.page.locator('[data-testid^=hand-card-]').first().click(STRIP);
  await calm.page.getByTestId('my-up-0').click();
  expect(await animatesSoon(calm.page, '[data-testid=my-up-0]')).toBe(false);

  for (const p of pages) await readyUp(p);
  for (const p of pages)
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');
  await alice.page.waitForTimeout(300);

  // Playing: whoever starts, the card flies to the pile for the player and for the watchers.
  let mover = alice.page;
  for (const p of pages) {
    if ((await p.getByTestId('karma-hint').getAttribute('data-my-turn')) === 'true') mover = p;
  }
  const snap = await snapshot(mover);
  // Not a 10: that would burn the pile and there would be no pile card left to watch fly in.
  const card = (snap.playableHand.find((c) => c.rank !== 10) ?? snap.playableHand[0])!;
  await mover.getByTestId(card.id).click(STRIP);
  await mover.getByTestId('karma-play').click();

  const watchers = [alice.page, bob.page].filter((p) => p !== mover);
  const [moverAnimates, ...watcherAnimates] = await Promise.all([
    animatesSoon(mover, '[data-testid=pile-top]'),
    ...watchers.map((p) => animatesSoon(p, '[data-testid=pile-top]')),
  ]);
  if (mover !== calm.page) expect(moverAnimates).toBe(true);
  else expect(moverAnimates).toBe(false);
  for (const [i, ok] of watcherAnimates.entries()) {
    expect(ok).toBe(watchers[i] !== calm.page);
  }

  for (const c of [alice, bob, calm]) await c.context.close();
});

test('tap selects, tapping again deselects, the Play button plays; Ready button works in the swap phase', async ({
  browser,
}) => {
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];

  await a.getByTestId('home-game-karma').click();

  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.getByTestId('home-join-code').fill(code);
  await b.getByTestId('home-join-submit').click();
  await a.getByTestId('lobby-start').click();
  for (const p of [a, b])
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');

  // The Ready button is there, and the three face-up cards float to say "change these".
  for (const p of [a, b]) await expect(p.getByTestId('karma-ready')).toBeVisible();

  // Swap phase: one tap only selects (you can change your mind); the Ready button gets you ready.
  const hand = (p: Page) => p.locator('[data-testid^=hand-card-]');
  await hand(a).nth(0).click(STRIP);
  await expect(hand(a).nth(0)).toHaveAttribute('aria-pressed', 'true');
  await hand(a).nth(1).click(STRIP); // a different card: the selection moves
  await expect(hand(a).nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(hand(a).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(a.getByTestId('karma-game')).toHaveAttribute('data-phase', 'swap');
  await hand(a).nth(1).click(STRIP); // tapping the selected card again deselects it
  await expect(hand(a).nth(1)).toHaveAttribute('aria-pressed', 'false');
  await a.getByTestId('karma-ready').click();
  await expect(b.getByText('Ready ✓')).toBeVisible(); // Bob sees Alice is ready

  await b.getByTestId('karma-ready').click();
  await expect(b.getByTestId('karma-ready')).toHaveCount(0);
  for (const p of [a, b])
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');

  // Play phase: find whoever starts.
  const mover = (await a.getByTestId('karma-hint').getAttribute('data-my-turn')) === 'true' ? a : b;
  const snap = await snapshot(mover);
  const [first] = snap.playableHand;
  expect(first).toBeTruthy();
  const pile = mover.getByTestId('pile');
  const group = (rank: number) => snap.playableHand.filter((c) => c.rank === rank);
  const pressed = (id: string, value: boolean) =>
    expect(mover.getByTestId(id)).toHaveAttribute('aria-pressed', String(value));

  // One tap selects (all cards of that rank, if you hold several): nothing is played yet.
  await mover.getByTestId(first!.id).click(STRIP);
  for (const c of group(first!.rank)) await pressed(c.id, true);
  await expect(mover.getByTestId('karma-hint')).toContainText('Press Play');
  await expect(pile).toHaveAttribute('data-count', '0');

  // Tapping the table (outside the cards) clears the selection.
  await mover.getByTestId('karma-hint').click();
  for (const c of group(first!.rank)) await pressed(c.id, false);

  // Tapping a selected card again deselects. With duplicates it deselects only that card (even
  // when tapped twice quickly: no play), and a further tap adds it back.
  await mover.waitForTimeout(450);
  const firstGroup = group(first!.rank);
  if (firstGroup.length > 1) {
    await mover.getByTestId(first!.id).click(STRIP); // selects the whole rank
    for (const c of firstGroup) await pressed(c.id, true);
    await mover.getByTestId(first!.id).click(STRIP); // deselects just this card
    await pressed(first!.id, false);
    for (const c of firstGroup.slice(1)) await pressed(c.id, true);
    await mover.getByTestId(first!.id).click(STRIP); // adds it back
    await pressed(first!.id, true);
    await mover.getByTestId('karma-hint').click(); // clear
  } else {
    await mover.getByTestId(first!.id).click(STRIP);
    await pressed(first!.id, true);
    await mover.waitForTimeout(450); // a slow second tap deselects
    await mover.getByTestId(first!.id).click(STRIP);
  }
  for (const c of firstGroup) await pressed(c.id, false);
  await expect(pile).toHaveAttribute('data-count', '0');
  await expect(mover.getByTestId('karma-play')).toBeDisabled();

  // Tapping a card of another rank selects that rank instead.
  const other = snap.playableHand.find((c) => c.rank !== first!.rank) ?? first!;
  await mover.waitForTimeout(450);
  await mover.getByTestId(other.id).click(STRIP);
  for (const c of group(other.rank)) await pressed(c.id, true);

  if (group(other.rank).length === 1) {
    // A card held once: a quick double tap plays it.
    await mover.waitForTimeout(450);
    await mover.getByTestId(other.id).click(STRIP); // deselect
    await mover.getByTestId(other.id).click(STRIP); // quickly again: plays
  } else {
    await mover.getByTestId('karma-play').click();
  }
  // (A 10 would burn the pile, leaving it empty, so check the narration rather than the pile size.)
  await expect(mover.getByTestId('karma-event')).toHaveAttribute('data-seq', /\d+/);

  for (const c of [alice, bob]) await c.context.close();
});

test('the pile is picked up with two taps, the deck explains itself, a timer counts down, buttons sit beside the cards', async ({
  browser,
}) => {
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];

  await a.getByTestId('home-game-karma').click();

  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.getByTestId('home-join-code').fill(code);
  await b.getByTestId('home-join-submit').click();
  await a.getByTestId('lobby-start').click();
  const tableCardWidth = async (p: Page) => (await p.getByTestId('my-up-0').boundingBox())!.width;
  const swapWidth = await tableCardWidth(a);
  for (const p of [a, b]) await readyUp(p);
  for (const p of [a, b])
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');

  const mover = (await a.getByTestId('karma-hint').getAttribute('data-my-turn')) === 'true' ? a : b;
  const other = mover === a ? b : a;

  // Once the game is on, the three table cards shrink to make room for the hand.
  await expect.poll(() => tableCardWidth(mover)).toBeLessThan(swapWidth * 0.8);

  // Timer counts down for both players; the action buttons sit beside (not under) my cards.
  for (const p of [a, b]) await expect(p.getByTestId('karma-timer')).toBeVisible();
  const hand = await mover.getByTestId('my-hand').boundingBox();
  const play = await mover.getByTestId('karma-play').boundingBox();
  const timerBefore = await mover.getByTestId('karma-timer').boundingBox();
  const up0 = await mover.getByTestId('my-up-0').boundingBox();
  expect(play!.x).toBeGreaterThanOrEqual(up0!.x + up0!.width - 2); // beside the table cards
  expect(play!.y + play!.height).toBeLessThanOrEqual(hand!.y + 4); // above the hand row

  // My hand dims while it is the other player's turn.
  await expect(mover.getByTestId('my-hand')).toHaveAttribute('data-dimmed', 'false');
  await expect(other.getByTestId('my-hand')).toHaveAttribute('data-dimmed', 'true');
  // The other player's hand is shown as a fan of face-down cards, one per card; Play is the lowest button.
  await expect(mover.locator('[data-testid^=seat-hand-]')).toHaveAttribute('data-count', '3');
  expect(play!.y).toBeGreaterThan(timerBefore!.y); // Play is the big button under the timer
  expect(play!.width).toBeGreaterThan(90);

  // The deck cannot be drawn from: tapping it only explains why.
  await mover.getByTestId('stock').click();
  await expect(mover.getByTestId('karma-hint')).toContainText('drawn for you');

  // Pile is empty: tapping it does nothing.
  await mover.getByTestId('pile').click();
  await expect(mover.getByTestId('pile-peek')).toHaveCount(0);

  // Play a card, then the other player picks the pile up with two taps.
  const snap = await snapshot(mover);
  await takeTurn(mover, snap);
  await expect(mover.getByTestId('karma-event')).toHaveAttribute('data-seq', /\d+/);
  // The action column keeps its place between turns (no bump when the turn passes).
  await expect(mover.getByTestId('karma-play')).toBeDisabled();
  const playAfter = await mover.getByTestId('karma-play').boundingBox();
  const timerAfter = await mover.getByTestId('karma-timer').boundingBox();
  expect(playAfter).toEqual(play);
  expect(timerAfter!.height).toBe(timerBefore!.height);
  const pile = other.getByTestId('pile');
  if (Number(await pile.getAttribute('data-count')) > 0) {
    await expect(other.getByTestId('karma-hint')).toHaveAttribute('data-my-turn', 'true');
    // Tapping the pile (when something can be played) shows the last moves; a tap elsewhere puts them back.
    const mustPick = (await pile.getAttribute('data-must-pick')) === 'true';
    if (!mustPick) {
      await pile.click();
      await expect(other.getByTestId('pile-peek')).toBeVisible();
      await other.getByTestId('pile-peek').click({ position: { x: 5, y: 5 } });
      await expect(other.getByTestId('pile-peek')).toHaveCount(0);
      return void (await Promise.all([alice, bob].map((c) => c.context.close())));
    }
    await pile.click();
    // The line narrates the move before the latest one: Alice's play, now that the pile is picked up.
    await expect(other.getByTestId('karma-event')).toContainText('played');
  }

  for (const c of [alice, bob]) await c.context.close();
});

// Needs voluntary pickups, which the UI no longer offers (pickup only when nothing can be played).
test.fixme('a very long hand (after picking up piles) wraps into rows (2 from 9 cards, 3 from 13) and every card stays reachable', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];

  await a.getByTestId('home-game-karma').click();

  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.getByTestId('home-join-code').fill(code);
  await b.getByTestId('home-join-submit').click();
  await a.getByTestId('lobby-start').click();
  for (const p of [a, b]) await readyUp(p);
  for (const p of [a, b])
    await expect(p.getByTestId('karma-game')).toHaveAttribute('data-phase', 'play');

  // Alice never plays when she can pick up, so every card Bob plays ends up in her hand.
  let guard = 0;
  while ((await snapshot(a)).handCount < 26) {
    if (guard++ > 300) throw new Error('could not build a long hand');
    let acted = false;
    for (const page of [a, b]) {
      const s = await snapshot(page);
      if (!s.myTurn) continue;
      const pileCount = Number(await page.getByTestId('pile').getAttribute('data-count'));
      if (page === a && pileCount > 0) {
        await a.getByTestId('pile').click(); // tap the pile twice: pick it up
        await a.getByTestId('pile').click();
      } else {
        await takeTurn(page, s);
      }
      await expect
        .poll(async () => (await snapshot(page)).event, { timeout: 10_000 })
        .not.toBe(s.event);
      acted = true;
      break;
    }
    if (!acted) await a.waitForTimeout(50);
  }

  // More than 8 cards wrap into extra rows instead of scrolling: nothing is cut off at the sides.
  const cards = a.locator('[data-testid^=hand-card-]');
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(26);
  const hand = a.getByTestId('my-hand');
  await expect(hand).toHaveAttribute('data-rows', String(rowsFor(count)));
  const viewport = a.viewportSize()!;
  const tops = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const box = (await cards.nth(i).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    const key = Math.round(box.y);
    tops.set(key, (tops.get(key) ?? 0) + 1);
  }
  expect(tops.size).toBe(rowsFor(count));
  for (const n of tops.values()) expect(n).toBeLessThanOrEqual(8);

  // A "trial" click performs every actionability check (scroll into view, nothing covering the card at the
  // tap point) without actually tapping: it is how we know a thumb could reach every single card.
  for (let i = 0; i < count; i++) await cards.nth(i).click({ ...STRIP, trial: true });

  for (const c of [alice, bob]) await c.context.close();
});
