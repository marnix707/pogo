import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../game/rng';
import { seaBattleGame as game } from './game';
import { BOARD, FLEET, FLEET_CELLS, overlaps, randomFleet, shipCells, validFleet } from './fleet';
import type { Ship } from './fleet';
import type { SeaBattleState } from './types';

const players = [
  { id: 'a', nickname: 'A', avatar: 'fox' },
  { id: 'b', nickname: 'B', avatar: 'cat' },
];

/** A fixed fleet along the top rows: carrier row 0, battleship row 1, ... destroyer row 4. */
const rows = (): Ship[] => FLEET.map((f, i) => ({ kind: f.kind, x: 0, y: i, vertical: false }));

function started(seed = 1): SeaBattleState {
  const rng = createSeededRng(seed);
  let s = game.createInitialState(players, {}, rng);
  s = game.applyMove(s, 'a', { type: 'ready', ships: rows() }, rng);
  s = game.applyMove(s, 'b', { type: 'ready', ships: rows() }, rng);
  return s;
}

describe('fleet', () => {
  it('has the classic 17 cells', () => {
    expect(FLEET_CELLS).toBe(17);
    expect(validFleet(rows())).toBe(true);
  });

  it('refuses overlap, off-board and incomplete fleets', () => {
    const f = rows();
    expect(validFleet(f.slice(1))).toBe(false);
    expect(validFleet(f.map((s, i) => (i === 1 ? { ...s, y: 0 } : s)))).toBe(false);
    expect(validFleet(f.map((s, i) => (i === 0 ? { ...s, x: 7 } : s)))).toBe(false);
    expect(overlaps({ kind: 'destroyer', x: 0, y: 0, vertical: false }, f)).toBe(true);
  });

  it('random fleets are always legal', () => {
    for (let seed = 1; seed <= 200; seed++)
      expect(validFleet(randomFleet(createSeededRng(seed)))).toBe(true);
  });
});

describe('Sea Battle', () => {
  it('needs both players ready before the battle starts, then the coin decides who begins', () => {
    const rng = createSeededRng(5);
    let s = game.createInitialState(players, {}, rng);
    expect(game.getCurrentPlayers(s).sort()).toEqual(['a', 'b']);
    expect(game.validateMove(s, 'a', { type: 'fire', x: 0, y: 0 }).ok).toBe(false);
    s = game.applyMove(s, 'a', { type: 'ready', ships: rows() }, rng);
    expect(s.phase).toBe('place');
    expect(game.getCurrentPlayers(s)).toEqual(['b']);
    expect(game.validateMove(s, 'a', { type: 'ready', ships: rows() }).ok).toBe(false);
    s = game.applyMove(s, 'b', { type: 'ready', ships: rows() }, rng);
    expect(s.phase).toBe('play');
    expect(game.getCurrentPlayers(s)).toEqual([s.first]);
  });

  it('refuses an illegal fleet', () => {
    const s = game.createInitialState(players, {}, createSeededRng(1));
    const v = game.validateMove(s, 'a', { type: 'ready', ships: rows().slice(1) });
    expect(v.ok).toBe(false);
  });

  it('alternates turns, reports hit / miss / sunk, and never lets you shoot a square twice', () => {
    const rng = createSeededRng(3);
    let s = started();
    const me = s.first;
    const other = me === 'a' ? 'b' : 'a';
    expect(game.validateMove(s, other, { type: 'fire', x: 0, y: 0 }).ok).toBe(false);
    s = game.applyMove(s, me, { type: 'fire', x: 9, y: 9 }, rng);
    expect(s.lastEvent?.result).toBe('miss');
    expect(s.turn).toBe(other);
    s = game.applyMove(s, other, { type: 'fire', x: 0, y: 4 }, rng); // destroyer, first cell
    expect(s.lastEvent?.result).toBe('hit');
    s = game.applyMove(s, me, { type: 'fire', x: 9, y: 8 }, rng);
    s = game.applyMove(s, other, { type: 'fire', x: 1, y: 4 }, rng);
    expect(s.lastEvent).toMatchObject({ result: 'sunk', sunk: 'destroyer', win: false });
    expect(game.validateMove(s, me, { type: 'fire', x: 9, y: 9 }).ok).toBe(false);
  });

  it('hides the opponent fleet until the game is over; the loser then sees the ships that were still afloat', () => {
    const rng = createSeededRng(3);
    let s = started();
    s = { ...s, turn: 'a', first: 'a' };
    expect(game.getPlayerView(s, 'a').revealed).toEqual([]);
    expect(game.getPlayerView(s, 'a')).not.toHaveProperty('players');
    // a sinks all of b's ships; b only ever hits water in the bottom rows.
    const cells = rows().flatMap(shipCells);
    cells.forEach(([x, y], i) => {
      s = game.applyMove(s, 'a', { type: 'fire', x, y }, rng);
      if (s.phase !== 'over')
        s = game.applyMove(
          s,
          'b',
          { type: 'fire', x: i % BOARD, y: 9 - Math.floor(i / BOARD) },
          rng,
        );
    });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('a');
    expect(s.lastEvent?.win).toBe(true);
    expect(game.getResults(s).rankings[0]).toMatchObject({ playerId: 'a', rank: 1 });
    expect(game.getCurrentPlayers(s)).toEqual([]);
    // b lost: a's whole fleet was still afloat and is revealed to b (and nothing is left to reveal to a).
    expect(game.getPlayerView(s, 'b').revealed).toHaveLength(5);
    expect(game.getPlayerView(s, 'a').revealed).toEqual([]);
    expect(game.getPlayerView(s, 'a').sunk).toHaveLength(5);
  });

  it('auto-played games between two computers always finish with a winner', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createSeededRng(seed);
      let s = game.createInitialState(players, {}, rng);
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        const current = game.getCurrentPlayers(s)[0] as string;
        const { move } = game.autoMove!(s, current, rng);
        expect(game.validateMove(s, current, move).ok).toBe(true);
        s = game.applyMove(s, current, move, rng);
      }
      expect(s.phase).toBe('over');
      expect(s.winner).not.toBeNull();
      // 100 squares at most per side.
      expect(s.shotCount).toBeLessThanOrEqual(200);
      const view = game.getPlayerView(s, s.winner as string);
      expect(view.outgoing.filter((x) => x.hit)).toHaveLength(FLEET_CELLS);
    }
  });

  it('the computer finishes off a ship it has hit', () => {
    const rng = createSeededRng(4);
    let s = started();
    s = { ...s, turn: 'a', first: 'a' };
    s = game.applyMove(s, 'a', { type: 'fire', x: 2, y: 0 }, rng); // carrier cell
    s = game.applyMove(s, 'b', { type: 'fire', x: 9, y: 9 }, rng);
    const next = game.autoMove!(s, 'a', rng).move;
    expect(next.type).toBe('fire');
    if (next.type === 'fire') expect(Math.abs(next.x - 2) + Math.abs(next.y - 0)).toBe(1);
  });
});
