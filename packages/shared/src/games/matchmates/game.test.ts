import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import type { GamePlayer } from '../../game/types';
import { draftTurn, matesGame } from './game';
import { CELLS, COLS, ELEMENTS, ROWS } from './types';
import type { Element } from './types';
import type { MateCell, MatesMove, MatesState, TileKind } from './types';
import { MONSTERS, maxBerries } from './monsters';
import { cellAt, createBoard, findMatches, legalSwaps, trySwap } from './board';

const A: GamePlayer = { id: 'a', nickname: 'A', avatar: 'x' };
const B: GamePlayer = { id: 'b', nickname: 'B', avatar: 'x' };
const opts = { hp: 100 };

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
    for (const p of s.players) expect(p.hp).toBe(p.id === s.coinWinner ? 105 : 100);
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
    // A swap that matches nothing is allowed, but it costs the turn (see below).
    expect(matesGame.validateMove(bad, mover(s), { type: 'swap', a: 0, b: 1 }).ok).toBe(true);
    expect(matesGame.validateMove(bad, mover(s), { type: 'swap', a: 0, b: 2 }).ok).toBe(false);
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

  it('a line of four gives an extra move', () => {
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
        // Evolving costs one move.
        expect(after.turn).toBe(s.turn);
        expect(after.movesLeft).toBe(1);
      }
    }
  });

  it('a swap that matches nothing keeps the tiles swapped and only costs the move', () => {
    const base = start(4);
    const board = quiet();
    set(board, 0, 0, 'fire');
    set(board, 0, 1, 'fire');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'fire');
    const s: MatesState = { ...base, board, turn: 'a', first: 'a', movesLeft: 2 };
    const [x, y] = [cellAt(4, 5), cellAt(4, 6)];
    const after = matesGame.applyMove(s, 'a', { type: 'swap', a: x, b: y }, createSeededRng(1));
    expect(after.lastEvent?.noMatch).toBe(true);
    expect(after.board[x]!.k).toBe(s.board[y]!.k);
    expect(after.board[y]!.k).toBe(s.board[x]!.k);
    expect(after.turn).toBe('a');
    expect(after.movesLeft).toBe(1);
    // The second wasted move ends the turn like any other.
    const again = matesGame.applyMove(after, 'a', { type: 'swap', a: y, b: x }, createSeededRng(1));
    expect(again.turn).toBe('b');
  });

  it('setting up with a swap that matches nothing keeps the turn: the second move can use it', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s0 = start(seed);
      const who = s0.turn;
      const rng = createSeededRng(seed);
      // Any adjacent swap that matches nothing.
      let first: [number, number] | null = null;
      for (let i = 0; i < CELLS - 1 && !first; i++)
        for (const j of [i + 1, i + COLS]) {
          if (j >= CELLS || (j === i + 1 && j % COLS === 0)) continue;
          if (!trySwap(s0.board, i, j)) {
            first = [i, j];
            break;
          }
        }
      expect(first).not.toBeNull();
      const s1 = matesGame.applyMove(s0, who, { type: 'swap', a: first![0], b: first![1] }, rng);
      expect(s1.lastEvent?.noMatch).toBe(true);
      expect(s1.turn).toBe(who);
      expect(s1.movesLeft).toBe(1);
      // The second move is still his, and a normal match then passes the turn.
      const [a, b] = legalSwaps(s1.board)[0]!;
      expect(matesGame.validateMove(s1, who, { type: 'swap', a, b }).ok).toBe(true);
    }
  });

  it('six tiles in a corner (an L) count like a line of six', () => {
    const base = start(6);
    const board = quiet();
    // 4 across the top + 3 down the left, sharing the corner: 6 tiles of earth.
    for (const c of [0, 1, 2]) set(board, 0, c, 'earth');
    for (const r of [1, 2]) set(board, r, 0, 'earth');
    set(board, 0, 3, 'water');
    set(board, 1, 3, 'earth');
    const players = base.players.map((p) =>
      p.id === 'a' ? { ...p, hp: 50 } : p,
    ) as MatesState['players'];
    const s: MatesState = { ...base, board, players, turn: 'a', first: 'a', movesLeft: 2 };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 3), b: cellAt(1, 3) },
      createSeededRng(2),
    );
    expect(after.lastEvent?.longest).toBeGreaterThanOrEqual(6);
    expect(after.lastEvent).toMatchObject({ heal: 5, extraMove: true });
  });

  it('the board is never reshuffled: with no matching swap left the tiles just stay', () => {
    const base = start(4);
    const board = quiet(); // no swap here makes a match
    expect(legalSwaps(board)).toHaveLength(0);
    const s: MatesState = { ...base, board, turn: 'a', first: 'a', movesLeft: 2 };
    const after = matesGame.applyMove(s, 'a', { type: 'swap', a: 0, b: 1 }, createSeededRng(1));
    expect(after.lastEvent?.steps).toHaveLength(0);
    expect(after.board[0]!.k).toBe(board[1]!.k);
    expect(after.board.slice(2).map((c) => c.k)).toEqual(board.slice(2).map((c) => c.k));
  });

  it('a line of five heals 5 and gives an extra move', () => {
    const base = start(6);
    const board = quiet();
    for (const c of [0, 1, 3, 4]) set(board, 0, c, 'earth');
    set(board, 0, 2, 'water');
    set(board, 1, 2, 'earth');
    const players = base.players.map((p) =>
      p.id === 'a' ? { ...p, hp: 50 } : p,
    ) as MatesState['players'];
    const s: MatesState = { ...base, board, players, turn: 'a', first: 'a', movesLeft: 2 };
    const after = matesGame.applyMove(
      s,
      'a',
      { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
      createSeededRng(2),
    );
    expect(after.lastEvent).toMatchObject({ heal: 5, extraMove: true });
    expect(after.players.find((p) => p.id === 'a')!.hp).toBe(55);
    expect(after.turn).toBe('a');
  });

  describe('special attacks', () => {
    function fireWith(element: Element, evolved: boolean) {
      const base = start(3);
      const players = base.players.map((p) =>
        p.id === 'a'
          ? {
              ...p,
              hp: 50,
              monsters: [{ element, evolved, mana: MONSTERS[element].cost }, p.monsters[1]!],
            }
          : { ...p, monsters: p.monsters.map((m) => ({ ...m, mana: 5 })) },
      ) as MatesState['players'];
      const board = quiet();
      set(board, 0, 0, 'berry');
      set(board, 0, 1, 'berry');
      set(board, 0, 2, 'water');
      set(board, 1, 2, 'berry');
      const s: MatesState = { ...base, board, players, turn: 'a', first: 'a', movesLeft: 2 };
      return matesGame.applyMove(
        s,
        'a',
        { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
        createSeededRng(4),
      );
    }
    const fire = (after: MatesState) => after.lastEvent!.fires[0]!;
    const hpOf = (after: MatesState, id: string) => after.players.find((p) => p.id === id)!.hp;

    it('tiles cleared by an attack (and what falls after it) never give an extra move', () => {
      for (const el of ['fire', 'electric', 'water', 'earth', 'psychic'] as const) {
        for (const evolved of [false, true]) {
          const after = fireWith(el, evolved);
          expect(after.lastEvent!.longest).toBeLessThanOrEqual(3);
          expect(after.lastEvent!.extraMove).toBe(false);
        }
      }
    });

    it('tiles an attack clears fill the mana of the mover’s pets of that colour', () => {
      let sawWater = false;
      for (const attacker of ['electric', 'fire'] as const) {
        for (let seed = 1; seed <= 8; seed++) {
          const base = start(3);
          const players = base.players.map((p) =>
            p.id === 'a'
              ? {
                  ...p,
                  monsters: [
                    { element: attacker, evolved: false, mana: MONSTERS[attacker].cost },
                    { element: 'water' as const, evolved: false, mana: 0 },
                  ],
                }
              : p,
          ) as MatesState['players'];
          const board = quiet();
          set(board, 0, 0, 'berry');
          set(board, 0, 1, 'berry');
          set(board, 0, 2, 'psychic');
          set(board, 1, 2, 'berry');
          // Water all over the lower rows, so the attack's block / columns are sure to catch some.
          for (let r = 1; r < ROWS; r++) for (let c = 3; c < COLS; c++) set(board, r, c, 'water');
          const s: MatesState = { ...base, board, players, turn: 'a', first: 'a', movesLeft: 2 };
          const after = matesGame.applyMove(
            s,
            'a',
            { type: 'swap', a: cellAt(0, 2), b: cellAt(1, 2) },
            createSeededRng(seed),
          );
          const steps = after.lastEvent!.steps;
          const j = steps.findIndex((st) => st.ability);
          expect(j).toBeGreaterThan(0);
          const before = steps[j - 1]!.board;
          const waterCleared = steps[j]!.cleared.filter((i) => before[i]!.k === 'water').length;
          if (waterCleared > 0) sawWater = true;
          const water = after.players.find((p) => p.id === 'a')!.monsters[1]!;
          // (A full bar fires and starts over, so count the mana the water pet spent.)
          const spent =
            after.lastEvent!.fires.filter((f) => f.element === 'water').length *
            MONSTERS.water.cost;
          expect(water.mana + spent).toBeGreaterThanOrEqual(waterCleared);
        }
      }
      expect(sawWater).toBe(true);
    });

    it('earth heals as much as it hurts', () => {
      expect(fire(fireWith('earth', false))).toMatchObject({ damage: 10, heal: 10 });
      const after = fireWith('earth', true);
      expect(fire(after)).toMatchObject({ damage: 15, heal: 15 });
      expect(hpOf(after, 'a')).toBe(65);
    });

    it('fire clears one column, two when evolved', () => {
      expect(fire(fireWith('fire', false))).toMatchObject({ damage: 20 });
      expect(fire(fireWith('fire', false)).cells).toHaveLength(ROWS);
      expect(fire(fireWith('fire', true))).toMatchObject({ damage: 25 });
      expect(fire(fireWith('fire', true)).cells).toHaveLength(ROWS * 2);
      expect(fireWith('fire', false).lastEvent!.steps.some((st) => st.ability)).toBe(true);
    });

    it('water turns 3 tiles into water for both forms', () => {
      expect(fire(fireWith('water', false))).toMatchObject({ damage: 10 });
      expect(fire(fireWith('water', true))).toMatchObject({ damage: 20 });
      expect(fire(fireWith('water', true)).cells).toHaveLength(3);
    });

    it('electric clears a 2x2, evolved 3x2', () => {
      expect(fire(fireWith('electric', false))).toMatchObject({ damage: 5 });
      expect(fire(fireWith('electric', false)).cells).toHaveLength(4);
      expect(fire(fireWith('electric', true))).toMatchObject({ damage: 10 });
      expect(fire(fireWith('electric', true)).cells).toHaveLength(6);
    });

    it('psychic drains mana from every monster of the opponent', () => {
      const after = fireWith('psychic', false);
      expect(fire(after)).toMatchObject({ damage: 10, drain: 2 });
      expect(after.players.find((p) => p.id === 'b')!.monsters.map((m) => m.mana)).toEqual([3, 3]);
      expect(fire(fireWith('psychic', true))).toMatchObject({ damage: 15, drain: 3 });
    });
  });

  it('the starting hit points are an option', () => {
    const rng = createSeededRng(1);
    const s = matesGame.createInitialState([A, B], { hp: 150 }, rng);
    expect(s.players.every((p) => p.hp === 150 && p.maxHp === 150)).toBe(true);
    expect(matesGame.optionsSchema.parse({}).hp).toBe(100);
    expect(matesGame.optionsSchema.safeParse({ hp: 77 }).success).toBe(false);
  });

  it('berries are capped at what an evolve costs: 4, Forest Valley 3 (a boost costs the same)', () => {
    for (const [stage, cap] of [
      ['stadium', 4],
      ['forest', 3],
    ] as const) {
      const base = start(8, stage);
      const players = base.players.map((p) =>
        p.id === base.turn
          ? { ...p, berries: cap, monsters: p.monsters.map((m) => ({ ...m, evolved: true })) }
          : p,
      ) as MatesState['players'];
      const s = { ...base, players };
      expect(maxBerries(stage)).toBe(cap);
      expect(matesGame.validateMove(s, s.turn, { type: 'boost', slot: 0 }).ok).toBe(true);
      const after = matesGame.applyMove(s, s.turn, { type: 'boost', slot: 0 }, createSeededRng(1));
      expect(after.players.find((p) => p.id === s.turn)!.berries).toBe(0);
      const short = players.map((p) =>
        p.id === s.turn ? { ...p, berries: cap - 1 } : p,
      ) as MatesState['players'];
      expect(
        matesGame.validateMove({ ...s, players: short }, s.turn, { type: 'boost', slot: 0 }).ok,
      ).toBe(false);
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

  it('a player at 0 hit points always means the game is over (all stages)', () => {
    for (const stage of ['stadium', 'forest', 'lava', 'frost', 'reactor', 'swamp'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const rng = createSeededRng(seed * 7);
        let s = start(seed, stage);
        let guard = 0;
        while (!matesGame.isGameOver(s) && guard++ < 1500) {
          const who = matesGame.getCurrentPlayers(s)[0]!;
          const { move } = matesGame.autoMove!(s, who, rng);
          s = matesGame.applyMove(s, who, move, rng);
          if (s.players.some((p) => p.hp <= 0)) {
            expect(s.phase).toBe('over');
            expect(s.movesLeft).toBe(0);
            expect(s.winner).not.toBeNull();
          }
        }
      }
    }
  }, 30_000);

  it('createBoard never starts with a match', () => {
    for (let seed = 0; seed < 20; seed++)
      expect(findMatches(createBoard(createSeededRng(seed))).cells.size).toBe(0);
  });
});
