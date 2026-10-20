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

/** Press the Ready button (swap phase). */
export async function readyUp(page: Page) {
  await page.getByTestId('karma-ready').click();
}

/**
 * Select a set of same-rank cards and press Play. Tapping one card of a rank selects all the
 * cards of that rank you hold, so one tap is enough for a set as well as for a single card.
 */
async function playSet(
  page: Page,
  ids: string[],
  tap: { position: { x: number; y: number } } | undefined,
) {
  await page.getByTestId(ids[0]!).click(tap);
  await page.getByTestId('karma-play').click();
}

export interface Snapshot {
  myTurn: boolean;
  event: string;
  handCount: number;
  playableHand: { id: string; rank: number }[];
  playableUp: { id: string; rank: number }[];
  hasUp: boolean;
  downs: string[];
  /** A face-down card was too low: the pile (pulsing) must be tapped to pick it up. */
  mustPick: boolean;
}

export const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const q = (sel: string) => [...document.querySelectorAll(sel)];
    const rank = (el: Element) => Number(el.getAttribute('data-rank'));
    const turn = document.querySelector('[data-testid=karma-hint]');
    return {
      myTurn: turn?.getAttribute('data-my-turn') === 'true',
      // data-seq changes with every move, even while the (n-1) text is still blank.
      event: `${document.querySelector('[data-testid=karma-event]')?.getAttribute('data-seq') ?? ''}|${
        document.querySelector('[data-testid=karma-event]')?.textContent ?? ''
      }`,
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
      mustPick:
        document.querySelector('[data-testid=pile]')?.getAttribute('data-must-pick') === 'true',
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
  if (s.mustPick) {
    await page.getByTestId('pile').click();
    return;
  }
  const choose = (cards: { id: string; rank: number }[]) => {
    const priority = (rank: number) => (rank === 10 ? 200 : rank === 2 ? 100 : rank);
    const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => priority(a) - priority(b));
    const rank = ranks.length > 1 && Math.random() < 0.25 ? ranks[1] : ranks[0];
    return cards.filter((c) => c.rank === rank);
  };

  if (s.handCount > 0) {
    const set = choose(s.playableHand);
    if (set.length === 0) {
      // nothing playable: the pile pulses and one tap picks it up
      await page.getByTestId('pile').click();
      return;
    }
    await playSet(
      page,
      set.map((c) => c.id),
      STRIP,
    );
  } else if (s.hasUp) {
    const set = choose(s.playableUp);
    if (set.length === 0) {
      // nothing playable: the pile pulses and one tap picks it up
      await page.getByTestId('pile').click();
      return;
    }
    await playSet(
      page,
      set.map((c) => c.id),
      undefined,
    );
  } else {
    await page.getByTestId(s.downs[0]!).click();
    await page.getByTestId('karma-play').click();
  }
}
