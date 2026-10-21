/**
 * How my hand is laid out: cards overlap in a row, and when a row would show too little of each
 * card the hand wraps into another row; a sparse hand spreads out to fill the width. Everything
 * follows from the shares below, so tweaking
 * the look is a matter of changing these numbers.
 */

/** Every card keeps at least this share of its width visible (the overlap is 1 minus this). */
export const MIN_VISIBLE = 0.3;
/**
 * A sparse row spreads out to use the width: each step is at most this share of a card (above 1 =
 * a gap between the cards, so a hand of 2-4 cards fills the row instead of huddling in the middle).
 */
export const MAX_VISIBLE = 1.5;
/** Extra room kept free at the edges of a spread-out row (on top of the container padding). */
const SPREAD_PAD_PX = 12;
/** Cards in the extra rows are drawn a bit smaller. */
export const WRAP_SCALE = 0.85;
/** Horizontal padding of the hand container (px-1 on both sides). */
const PADDING_PX = 8;

export interface HandLayout {
  rows: number;
  /** Cards in the fullest row (rows are balanced, so others hold this or one fewer). */
  perRow: number;
  /** Font size in px per em for the hand cards (a card is 5em x 7em). */
  font: number;
  /** Distance between the left edges of neighbouring cards in a row, in px (> card width = a gap). */
  strip: number;
}

/** The most cards one row of this width can hold while each shows at least MIN_VISIBLE. */
export function maxPerRow(width: number, cardW: number): number {
  return Math.max(1, Math.floor((width - PADDING_PX - cardW) / (MIN_VISIBLE * cardW)) + 1);
}

/**
 * Picks the fewest rows for which every card still shows at least MIN_VISIBLE of its width.
 * `width` is the measured width of the hand container, `baseFont` the card size of a single row.
 */
export function handLayout(count: number, width: number, baseFont: number): HandLayout {
  let rows = 1;
  for (;;) {
    const font = baseFont * (rows > 1 ? WRAP_SCALE : 1);
    if (Math.ceil(count / rows) <= maxPerRow(width, font * 5) || rows >= Math.max(1, count)) break;
    rows++;
  }
  const font = baseFont * (rows > 1 ? WRAP_SCALE : 1);
  const cardW = font * 5;
  const perRow = Math.max(1, Math.ceil(count / rows));
  const fit =
    perRow > 1 ? (width - PADDING_PX - SPREAD_PAD_PX - cardW) / (perRow - 1) : cardW * MAX_VISIBLE;
  const strip = Math.max(cardW * MIN_VISIBLE, Math.min(cardW * MAX_VISIBLE, fit));
  return { rows, perRow, font, strip };
}
