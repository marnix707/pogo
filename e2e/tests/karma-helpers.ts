import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

export async function newPlayer(browser: Browser, nickname: string, avatar: string) {
  // Reduced motion keeps card animations from slowing down the automated taps.
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill(nickname);
  await page.getByRole('button', { name: avatar, exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText(nickname);
  return { context, page };
}

// Cards in the fanned hand overlap, so tap the visible left strip, like a thumb would.
export const STRIP = { position: { x: 6, y: 14 } };

/** Getting ready (and playing) is a double tap: select a card, then tap the same card again. */
export async function doubleTapFirstCard(page: Page) {
  const card = page.locator('[data-testid^=hand-card-]').first();
  await card.click(STRIP);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await card.click(STRIP);
}

export interface Snapshot {
  myTurn: boolean;
  event: string;
  handCount: number;
  playableHand: { id: string; rank: number }[];
  playableUp: { id: string; rank: number }[];
  hasUp: boolean;
  downs: string[];
}

export const snapshot = (page: Page): Promise<Snapshot> =>
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
        rank: rank(e), // data-rank: J, Q, K, A are 11-14 (parsing the label would give NaN)
      })),
      hasUp: q('[data-testid^=my-up-]').length > 0,
      downs: q('[data-testid^=my-down-]').map((e) => e.getAttribute('data-testid')!),
    };
  });

/**
 * One sensible move through the real UI: play all cards of the lowest playable rank (2s and 10s last),
 * sometimes the second lowest, else pick up; blind cards at the end. The randomness matters: a purely
 * "always the lowest card" strategy can circle forever (e.g. a 7 nobody can follow gets picked up
 * and led again), which also hits real auto-play. Tap each card of the rank to select it, then tap one again.
 */
export async function takeTurn(page: Page, s: Snapshot) {
  const choose = (cards: { id: string; rank: number }[]) => {
    const priority = (rank: number) => (rank === 10 ? 200 : rank === 2 ? 100 : rank);
    const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => priority(a) - priority(b));
    const rank = ranks.length > 1 && Math.random() < 0.25 ? ranks[1] : ranks[0];
    return cards.filter((c) => c.rank === rank);
  };

  if (s.handCount > 0) {
    const set = choose(s.playableHand);
    if (set.length === 0) return page.getByTestId('karma-pickup').click();
    for (const card of set) await page.getByTestId(card.id).click(STRIP); // select (adds same-rank cards)
    await page.getByTestId(set[0]!.id).click(STRIP); // tap a selected card again: play them all
  } else if (s.hasUp) {
    const set = choose(s.playableUp);
    if (set.length === 0) return page.getByTestId('karma-pickup').click();
    for (const card of set) await page.getByTestId(card.id).click();
    await page.getByTestId(set[0]!.id).click();
  } else {
    await page.getByTestId(s.downs[0]!).click();
    await page.getByTestId(s.downs[0]!).click();
  }
}
