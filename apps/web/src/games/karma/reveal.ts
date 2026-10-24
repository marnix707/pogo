/**
 * When the game is decided the player who is left turns over everything they still hold: face-down
 * cards first (left to right), then the hand. These numbers time that, and the results panel waits
 * for it (`resultsDelayMs`) so the table stays on screen while the cards turn.
 *
 * It starts when the game is really over: after a last face-down card, that is when its own turn
 * has finished (the moment the confetti starts); otherwise a short beat after the last move.
 */
export const REVEAL_BASE_MS = 700;
/** The last face-down card's turn (`TURN_MS` in KarmaGame) plus a beat: keep the two in step. */
export const AFTER_LAST_CARD_MS = 2500 + 300;
/** One card turning: the back shrinks to a line, then the face grows back (`card-*` in index.css). */
export const REVEAL_FLIP_MS = 700;
/** How long the turned-over cards stay in view before the results cover the table. */
export const REVEAL_HOLD_MS = 1500;

interface Leftovers {
  hand: number[];
  faceDown: (number | null)[];
}

export const leftoverCount = (l: Leftovers | null | undefined): number =>
  l ? l.hand.length + l.faceDown.filter((c) => c !== null).length : 0;

/** Delay (ms after the game ended) before the first card turns. */
export const revealStartMs = (afterLastCard: boolean): number =>
  afterLastCard ? AFTER_LAST_CARD_MS : REVEAL_BASE_MS;

/** Time between two cards; a long hand is turned quicker so the whole thing stays under ~4 s. */
export const revealStep = (n: number): number => Math.min(420, 3000 / Math.max(1, n));

/** When the last card has finished turning (0 when there is nothing to turn). */
export const revealTotalMs = (n: number, start: number = REVEAL_BASE_MS): number =>
  n <= 0 ? 0 : start + (n - 1) * revealStep(n) + REVEAL_FLIP_MS;

/** Start time (ms after the game ended) of every card's turn; null for an empty face-down slot. */
export function revealPlan(
  l: Leftovers,
  start: number = REVEAL_BASE_MS,
): { down: (number | null)[]; hand: number[] } {
  const step = revealStep(leftoverCount(l));
  let k = 0;
  const down = l.faceDown.map((c) => (c === null ? null : start + k++ * step));
  const hand = l.hand.map(() => start + k++ * step);
  return { down, hand };
}
