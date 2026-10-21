/**
 * When the game is decided the player who is left turns over everything they still hold: face-down
 * cards first (left to right), then the hand. These numbers time that, and the results panel waits
 * for it (`resultsDelayMs`) so the table stays on screen while the cards turn.
 */
export const REVEAL_BASE_MS = 700;
/** One card turning: it shrinks to a line, then the face grows back. */
export const REVEAL_FLIP_MS = 450;

interface Leftovers {
  hand: number[];
  faceDown: (number | null)[];
}

export const leftoverCount = (l: Leftovers | null | undefined): number =>
  l ? l.hand.length + l.faceDown.filter((c) => c !== null).length : 0;

/** Time between two cards; a long hand is turned quicker so the whole thing stays under ~3.5 s. */
export const revealStep = (n: number): number => Math.min(220, 2400 / Math.max(1, n));

/** How long the reveal takes in total (0 when there is nothing to turn). */
export const revealTotalMs = (n: number): number =>
  n <= 0 ? 0 : REVEAL_BASE_MS + n * revealStep(n) + REVEAL_FLIP_MS;

/** Start time (ms after the game ended) of every card's turn; null for an empty face-down slot. */
export function revealPlan(l: Leftovers): { down: (number | null)[]; hand: number[] } {
  const step = revealStep(leftoverCount(l));
  let k = 0;
  const down = l.faceDown.map((c) => (c === null ? null : REVEAL_BASE_MS + k++ * step));
  const hand = l.hand.map(() => REVEAL_BASE_MS + k++ * step);
  return { down, hand };
}
