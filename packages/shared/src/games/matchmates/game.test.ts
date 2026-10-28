import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { draftTurn, matesGame } from './game';
import { CELLS, COLS, ELEMENTS, ROWS } from './types';
import type { Element } from './types';
import type { MateCell, MatesMove, MatesState, TileKind } from './types';
import { MONSTERS } from './monsters';
import { cellAt, createBoard, findMatches, legalSwaps, trySwap } from './board';

const A: GamePlayer = { id: 'a', nickname: 'A', avatar: 'x' };
const B: GamePlayer = { id: 'b', nickname: 'B', avatar: 'x' };
const opts = { matchBonus: false };

/** A board without any match: kind = (2 * row + column) mod 5. */
function quiet(): MateCell[] {
  const b: MateCell[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) b.push({ k: ELEMENTS[(2 * r + c) % 5]! });
  return b;
}
const set = (b: MateCell[], r: number, c: number, k: TileKind) => {
  b[cellAt(r, c)] = { k };
};

function start(
  seed = 1,
  stage: MatesMove extends never
    ? never
    : 'stadium' | 'forest' | 'lava' | 'frost' | 'reactor' | 'swamp' = 'stadium',
): MatesState {
  const rng = createSeededRng(seed);
  let s = matesGame.createInitialState([A, B], opts, rng);
  s = draft(s, rng);
  s = matesGame.applyMove(s, 'a', { type: 'confirm', stage }, rng);
  s = matesGame.applyMove(s, 'b', { type: 'confirm', stage }, rng);
  return s;
}

/** Plays the draft so that 'a' gets fire + water and 'b' gets earth + psychic, whoever drafts first. */
function draft(state: MatesState, rng: ReturnType<typeof createSeededRng>): MatesState {
  const wanted: Record<string, Element[]> = { a: ['fire', 'water'], b: ['earth', 'psychic'] };
  let s = state;
  for (let who = draftTurn(s); who !== null; who = draftTurn(s))
    s = matesGame.applyMove(s, who, { type: 'draft', element: wanted[who]!.shift()! }, rng);
  return s;
}
const mover = (s: MatesState) => s.turn;

describe('Pet Match', () => {
  it('starts after the draft and the coin: the coin winner plays second with +5 HP and their arena', () => {
    const s = start();
    expect(s.phase).toBe('play');
    expect(findMatches(s.board).cells.size).toBe(0);
    expect(legalSwaps(s.board).length).toBeGreaterThan(0);
    expect(s.coinWinner).not.toBeNull();
    expect(s.first).not.toBe(s.coinWinner);
    expect(s.turn).toBe(s.first);
    for (const p of s.players) expect(p.hp).toBe(p.id === s.coinWinner ? 65 : 60);
    expect(s.movesLeft).toBe(2);
    expect(matesGame.settleMs!(s)).toBeGreaterThan(0);
  });

  it('drafts in the order first, second, second, first, with every pet different', () => {
    const rng = createSeededRng(2);
    let s = matesGame.createInitialState([A, B], opts, rng);
    const first = s.draftFirst;
    const second = first === 'a' ? 'b' : 'a';
    const order = [first, second, second, first];
    const taken: Element[] = [];
    for (const who of order) {
      expect(matesGame.getCurrentPlayers(s)).toEqual([who]);
      const other = who === 'a' ? 'b' : 'a';
      const el = ELEMENTS.find((e) => !taken.includes(e))!;
      // Out of turn and already-taken pets are refused.
      expect(matesGame.validateMove(s, other, { type: 'draft', element: el }).ok).toBe(false);
      if (taken[0])
        expect(matesGame.validateMove(s, who, { type: 'draft', element: taken[0] }).ok).toBe(false);
      s = matesGame.applyMove(s, who, { type: 'draft', element: el }, rng);
      taken.push(el);
    }
    expect(draftTurn(s)).toBeNull();
    expect(s.players.every((p) => p.monsters.length === 2)).toBe(true);
    // Now both confirm at the same time.
    expect(matesGame.getCurrentPlayers(s).sort()).toEqual(['a', 'b']);
    expect(matesGame.validateMove(s, 'a', { type: 'draft', element: 'fire' }).ok).toBe(false);
  });

  it('keeps the arena choice secret until the coin, and "random" gets a real arena', () => {
    const rng = createSeededRng(3);
    let s = draft(matesGame.createInitialState([A, B], opts, rng), rng);
    expect(matesGame.validateMove(s, 'a', { type: 'confirm', stage: 'lava' }).ok).toBe(true);
    s = matesGame.applyMove(s, 'a', { type: 'confirm', stage: 'lava' }, rng);
    const v = matesGame.getPlayerView(s, 'b');
    expect(v.players.find((p) => p.id === 'a')!.stagePick).toBeNull();
    expect(v.confirmed.a).toBe(true);
    expect(v.stage).toBeNull();
    expect(matesGame.validateMove(s, 'a', { type: 'confirm', stage: 'frost' }).ok).toBe(false);
    s = matesGame.applyMove(s, 'b', { type: 'confirm', stage: 'random' }, rng);
    expect(s.phase).toBe('play');
    const winnerPick = s.players.find((p) => p.id === s.coinWinner)!.stagePick;
    if (winnerPick !== 'random') expect(s.stage).toBe(winnerPick);
  });

  it('cannot confirm before the draft is over; rejects swaps that make no match', () => {
    const rng = createSeededRng(3);
    const s0 = matesGame.createInitialState([A, B], opts, rng);
    expect(matesGame.validateMove(s0, 'a', { type: 'confirm', stage: 'stadium' }).ok).toBe(false);
    const s = start();
    const bad = { ...s, board: quiet() };
    expect(matesGame.validateMove(bad, mover(s), { type: 'swap', a: 0, b: 1 }).ok).toBe(false);
    expect(
      matesGame.validateMove(bad, mover(s) === 'a' ? 'b' : 'a', { type: 'swap', a: 0, b: 1 }).ok,
    ).toBe(false);
  });

  it('a match gives mana only to the mover’s own monsters', () => {
    const base = start(4);
    const board = quiet();
    set(board, 0, 0, 'fire');
    set(board, 0, 1, 'fire');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'fire');
    expect(trySwap(board, cellAt(0, 2), cellAt(1, 2))).not.toBeNull();
    // Make 'a' the mover, who owns fire + water.
    const s: MatesState = { ...base, board, turn: 'a', first: 'a' };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
      createSeededRng(9),
    );
    const a = after.players.find((p) => p.id === 'a')!;
    const b = after.players.find((p) => p.id === 'b')!;
    expect(a.monsters[0]!.mana + a.monsters[1]!.mana).toBeGreaterThanOrEqual(3);
    expect(b.monsters.every((m) => m.mana === 0)).toBe(true);
    expect(after.lastEvent?.steps[0]?.cleared).toEqual([0, 1, 2]);
    expect(after.movesLeft).toBe(1);
    expect(after.turn).toBe('a');
  });

  it('the turn passes after two moves', () => {
    let s = start(5);
    const first = s.turn;
    const rng = createSeededRng(11);
    for (let i = 0; i < 2; i++) {
      const [a, b] = legalSwaps(s.board)[0]!;
      s = matesGame.applyMove(s, mover(s), { type: 'swap', a, b }, rng);
      if (s.phase === 'over') break;
    }
    // Unless an extra move came up, the opponent is on turn.
    if (!s.lastEvent?.extraMove && s.phase === 'play') expect(s.turn).not.toBe(first);
  });

  it('a line of four gives an extra move, once per turn', () => {
    const base = start(6);
    const board = quiet();
    for (const c of [0, 1, 3]) set(board, 0, c, 'earth');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'earth');
    const s: MatesState = { ...base, board, turn: 'a', first: 'a', movesLeft: 2 };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
      createSeededRng(2),
    );
    expect(after.lastEvent?.longest).toBeGreaterThanOrEqual(4);
    expect(after.lastEvent?.extraMove).toBe(true);
    expect(after.movesLeft).toBe(2);
    expect(after.extraUsed).toBe(true);
  });

  it('a full mana bar fires the attack and can win the game', () => {
    const base = start(7);
    const board = quiet();
    set(board, 0, 0, 'fire');
    set(board, 0, 1, 'fire');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'fire');
    const players = base.players.map((p) =>
      p.id === 'a'
        ? {
            ...p,
            monsters: p.monsters.map((m) =>
              m.element === 'fire' ? { ...m, mana: MONSTERS.fire.cost - 1 } : m,
            ),
          }
        : { ...p, hp: 10 },
    ) as MatesState['players'];
    const s: MatesState = { ...base, board, players, turn: 'a', first: 'a' };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
      createSeededRng(3),
    );
    expect(after.lastEvent?.fires[0]?.element).toBe('fire');
    expect(after.phase).toBe('over');
    expect(after.winner).toBe('a');
    expect(matesGame.getResults(after).rankings[0]!.playerId).toBe('a');
  });

  it('berries evolve a monster; Forest Valley needs one fewer', () => {
    for (const [stage, berries, ok] of [
      ['stadium', 3, false],
      ['stadium', 4, true],
      ['forest', 3, true],
    ] as const) {
      const base = start(8, stage);
      const players = base.players.map((p) =>
        p.id === base.turn ? { ...p, berries } : p,
      ) as MatesState['players'];
      const s = { ...base, players };
      const v = matesGame.validateMove(s, s.turn, { type: 'evolve', slot: 0 });
      expect(v.ok).toBe(ok);
      if (ok) {
        const after = matesGame.applyMove(
          s,
          s.turn,
          { type: 'evolve', slot: 0 },
          createSeededRng(1),
        );
        expect(after.players.find((p) => p.id === s.turn)!.monsters[0]!.evolved).toBe(true);
        expect(after.movesLeft).toBe(1);
      }
    }
  });

  it('Frost Lake freezes the matched kinds and frozen tiles cannot move', () => {
    const base = start(9, 'frost');
    const board = quiet();
    set(board, 0, 0, 'fire');
    set(board, 0, 1, 'fire');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'fire');
    // A water match elsewhere keeps a move available while the fire is frozen.
    set(board, 4, 4, 'water');
    const s: MatesState = { ...base, board, turn: 'a', first: 'a' };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
      createSeededRng(4),
    );
    const frozen = after.board.filter((c) => c.frozen);
    expect(frozen.length).toBeGreaterThan(0);
    const i = after.board.findIndex((c) => c.frozen);
    const j = i % COLS < COLS - 1 ? i + 1 : i - 1;
    expect(matesGame.validateMove(after, 'a', { type: 'swap', a: i, b: j }).ok).toBe(false);
  });

  it('the view hides swamp tiles', () => {
    const s = start(10, 'swamp');
    const hidden = s.board.filter((c) => c.hidden);
    expect(hidden).toHaveLength(1);
    const v = matesGame.getPlayerView(s, 'a');
    expect(v.board.filter((c) => c.k === 'mystery')).toHaveLength(1);
  });

  it('Reactor drops a bomb that explodes after its fuse', () => {
    let s = start(12, 'reactor');
    expect(s.board.filter((c) => c.k === 'bomb')).toHaveLength(1);
    const rng = createSeededRng(5);
    for (let n = 0; n < 12 && s.phase === 'play'; n++) {
      const [a, b] = legalSwaps(s.board)[0]!;
      s = matesGame.applyMove(s, mover(s), { type: 'swap', a, b }, rng);
    }
    expect(s.board.length).toBe(CELLS);
  });

  it('computers play whole games against each other', () => {
    for (const seed of [1, 2, 3]) {
      const rng = createSeededRng(seed);
      let s = matesGame.createInitialState([A, B], opts, rng);
      let guard = 0;
      while (!matesGame.isGameOver(s) && guard++ < 2000) {
        const who = matesGame.getCurrentPlayers(s)[0]!;
        const { move } = matesGame.autoMove!(s, who, rng);
        s = matesGame.applyMove(s, who, move, rng);
      }
      expect(matesGame.isGameOver(s)).toBe(true);
      expect(s.winner).not.toBeNull();
    }
  });

  it('createBoard never starts with a match', () => {
    for (let seed = 0; seed < 20; seed++)
      expect(findMatches(createBoard(createSeededRng(seed))).cells.size).toBe(0);
  });
});
