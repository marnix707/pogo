/**
 * How my hand is laid out: cards overlap in a row, and when a row would show too little of each
 * card the hand wraps into another row; a sparse hand spreads out to fill the width. Everything
 * follows from the shares below, so tweaking
 * the look is a matter of changing these numbers.
 */

/** Cards overlap at most 30%: every card keeps at least this share of its width visible. */
export const MIN_VISIBLE = 0.7;
/** ...and at least 10%: a sparse row spreads only until each card shows this share of its width. */
export const MAX_VISIBLE = 0.9;
/** Cards in the extra rows are drawn smaller: two rows, and three or more rows. */
export const WRAP_SCALE = 0.85;
export const MANY_ROWS_SCALE = 0.7;
/** The biggest cards a layout with this many rows may use (extra rows save height with smaller cards). */
const maxScale = (rows: number) => (rows <= 1 ? 1 : rows === 2 ? WRAP_SCALE : MANY_ROWS_SCALE);
/** A row may shrink its cards to this share of that size to fit more cards before another row is added. */
const MIN_SHRINK = 0.75;
/** Extra room kept free at the edges of a spread-out row (on top of the container padding). */
const SPREAD_PAD_PX = 12;
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
 * Picks the fewest rows for which every card still shows at least MIN_VISIBLE of its width, letting
 * the cards shrink continuously (down to MIN_SHRINK of their size) before a row is added.
 * `width` is the measured width of the hand container, `baseFont` the full card size.
 */
export function handLayout(count: number, width: number, baseFont: number): HandLayout {
  let rows = 1;
  let scale = 1;
  for (; ; rows++) {
    const perRow = Math.max(1, Math.ceil(count / rows));
    // The widest card for which `perRow` cards fit with the largest allowed overlap.
    const fitCardW = (width - PADDING_PX) / (1 + (perRow - 1) * MIN_VISIBLE);
    scale = Math.min(maxScale(rows), fitCardW / (baseFont * 5));
    if (scale >= maxScale(rows) * MIN_SHRINK || rows >= Math.max(1, count)) break;
  }
  const font = baseFont * scale;
  const cardW = font * 5;
  const perRow = Math.max(1, Math.ceil(count / rows));
  const fit =
    perRow > 1 ? (width - PADDING_PX - SPREAD_PAD_PX - cardW) / (perRow - 1) : cardW * MAX_VISIBLE;
  const strip = Math.max(cardW * MIN_VISIBLE, Math.min(cardW * MAX_VISIBLE, fit));
  return { rows, perRow, font, strip };
}
