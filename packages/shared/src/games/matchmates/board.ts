import type { Rng } from '../../game/rng';
import { COLS, ELEMENTS, ROWS } from './types';
import type { MateCell } from './types';

export const cellAt = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;

/** Elements and berries match; bombs and anything unknown do not. */
const matchable = (c: MateCell | undefined): c is MateCell =>
  !!c && c.k !== 'bomb' && c.k !== 'mystery';

export function randomTile(rng: Rng): MateCell {
  const r = rng.int(16);
  return { k: r === 15 ? 'berry' : (ELEMENTS[r % 5] as (typeof ELEMENTS)[number]) };
}

export interface Matches {
  cells: Set<number>;
  /** Length of the longest straight line. */
  longest: number;
}

export function findMatches(board: readonly MateCell[]): Matches {
  const cells = new Set<number>();
  let longest = 0;
  const scan = (outer: number, inner: number, at: (o: number, i: number) => number) => {
    for (let o = 0; o < outer; o++) {
      let start = 0;
      for (let i = 1; i <= inner; i++) {
        const prev = board[at(o, start)];
        const cur = i < inner ? board[at(o, i)] : undefined;
        if (cur && matchable(cur) && matchable(prev) && cur.k === prev.k) continue;
        const len = i - start;
        if (len >= 3 && matchable(prev)) {
          longest = Math.max(longest, len);
          for (let j = start; j < i; j++) cells.add(at(o, j));
        }
        start = i;
      }
    }
  };
  scan(ROWS, COLS, (o, i) => cellAt(o, i));
  scan(COLS, ROWS, (o, i) => cellAt(i, o));
  return { cells, longest };
}

export const adjacent = (a: number, b: number): boolean =>
  Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;

/** The board after swapping two neighbouring squares, or null when the swap is not allowed or makes no match. */
export function trySwap(board: readonly MateCell[], a: number, b: number): MateCell[] | null {
  const ca = board[a];
  const cb = board[b];
  if (!ca || !cb || !adjacent(a, b) || ca.frozen || cb.frozen) return null;
  const next = board.map((c) => ({ ...c }));
  next[a] = { ...cb };
  next[b] = { ...ca };
  return findMatches(next).cells.size > 0 ? next : null;
}

/** All legal swaps (right and down neighbours cover every pair once). */
export function legalSwaps(board: readonly MateCell[]): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = cellAt(r, c);
      if (c + 1 < COLS && trySwap(board, i, i + 1)) out.push([i, i + 1]);
      if (r + 1 < ROWS && trySwap(board, i, i + COLS)) out.push([i, i + COLS]);
    }
  return out;
}

/** A board with no matches and at least one possible move. */
export function createBoard(rng: Rng): MateCell[] {
  for (;;) {
    const board: MateCell[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        let cell = randomTile(rng);
        for (let tries = 0; tries < 20; tries++) {
          const left2 =
            c >= 2 &&
            board[cellAt(r, c - 1)]!.k === cell.k &&
            board[cellAt(r, c - 2)]!.k === cell.k;
          const up2 =
            r >= 2 &&
            board[cellAt(r - 1, c)]!.k === cell.k &&
            board[cellAt(r - 2, c)]!.k === cell.k;
          if (!left2 && !up2) break;
          cell = randomTile(rng);
        }
        board.push(cell);
      }
    if (findMatches(board).cells.size === 0 && legalSwaps(board).length > 0) return board;
  }
}

/** Remove squares, let the rest fall (flags travel with their tile), fill the top with new tiles. */
export function dropAndRefill(
  board: readonly MateCell[],
  gone: ReadonlySet<number>,
  rng: Rng,
): MateCell[] {
  const next: MateCell[] = new Array<MateCell>(board.length);
  for (let c = 0; c < COLS; c++) {
    const kept: MateCell[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = cellAt(r, c);
      if (!gone.has(i)) kept.push(board[i] as MateCell);
    }
    for (let r = ROWS - 1, n = 0; r >= 0; r--, n++) next[cellAt(r, c)] = kept[n] ?? randomTile(rng);
  }
  return next;
}
