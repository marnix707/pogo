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

/** Getting ready (and playing) is a fast double tap; a slow second tap deselects instead. */
export async function doubleTapFirstCard(page: Page) {
  const card = page.locator('[data-testid^=hand-card-]').first();
  await card.click(STRIP);
  await card.click(STRIP);
}

/**
 * Select a set of same-rank cards and play it. One card: tap twice quickly. Several: tap each to
 * select, then tap the first one twice quickly (the first tap deselects it, the fast second one
 * plays the whole selection, with that card included).
 */
async function playSet(
  page: Page,
  ids: string[],
  tap: { position: { x: number; y: number } } | undefined,
) {
  for (const id of ids) await page.getByTestId(id).click(tap);
  if (ids.length === 1) await page.getByTestId(ids[0]!).click(tap);
  else {
    await page.getByTestId(ids[0]!).click(tap);
    await page.getByTestId(ids[0]!).click(tap);
  }
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
    await playSet(
      page,
      set.map((c) => c.id),
      STRIP,
    );
  } else if (s.hasUp) {
    const set = choose(s.playableUp);
    if (set.length === 0) return page.getByTestId('karma-pickup').click();
    await playSet(
      page,
      set.map((c) => c.id),
      undefined,
    );
  } else {
    await page.getByTestId(s.downs[0]!).click();
    await page.getByTestId(s.downs[0]!).click();
  }
}
