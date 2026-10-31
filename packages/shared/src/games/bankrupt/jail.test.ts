import { expect, it } from 'vitest';
import type { Rng } from '../../game/rng';
import { bankruptGame as game } from './game';

/** Dice from a queue; the luck card is always "Go to jail" (the last card of the deck). */
const scripted = (dice: number[]): Rng => ({
  int: (n) => (n === 6 ? dice.shift()! - 1 : n === 10 ? 9 : 0),
});

it('landing on the Jail space puts you in jail: asked at once, then three skipped turns', () => {
  const q: number[] = [];
  const rng: Rng = { int: (n) => (n === 6 ? q.shift()! - 1 : 0) };
  let s = game.createInitialState(
    [
      { id: 'a', nickname: 'A', avatar: 'x' },
      { id: 'b', nickname: 'B', avatar: 'x' },
    ],
    { target: 0, turns: 0, auctionOnDecline: false },
    rng,
  );
  const first = s.players[0]!.id;
  const second = s.players[1]!.id;
  const play = (id: string, move: Parameters<typeof game.applyMove>[2]) => {
    s = game.applyMove(s, id, move, rng);
  };
  // 6 + 6 + 2 = space 14: Jail (each six rolls again; the spaces on the way are passed)
  q.push(6);
  play(first, { type: 'roll' });
  play(first, { type: 'decline' });
  q.push(6);
  play(first, { type: 'roll' });
  play(first, { type: 'decline' });
  q.push(2);
  play(first, { type: 'roll' });
  expect(s.phase).toBe('jailAsk');
  expect(s.players.find((p) => p.id === first)!.jail).toBe(3);
  play(first, { type: 'wait' });
  for (let turn = 0; turn < 3; turn++) {
    expect(s.players[s.turn]!.id).toBe(second);
    q.push(3);
    play(second, { type: 'roll' });
    play(second, { type: 'decline' });
  }
  q.push(3);
  expect(s.players[s.turn]!.id).toBe(second);
  play(second, { type: 'roll' });
  play(second, { type: 'decline' });
  expect(s.players[s.turn]!.id).toBe(first);
});

it('a player sent to jail by a card who passes sits out three turns and never rolls', () => {
  const rng = scripted([]);
  let s = game.createInitialState(
    [
      { id: 'a', nickname: 'A', avatar: 'x' },
      { id: 'b', nickname: 'B', avatar: 'x' },
    ],
    { target: 0, turns: 0, auctionOnDecline: false },
    rng,
  );
  const first = s.players[0]!.id;
  const second = s.players[1]!.id;
  const q: number[] = [];
  const play = (id: string, move: Parameters<typeof game.applyMove>[2]) => {
    s = game.applyMove(s, id, move, { int: (n) => (n === 6 ? q.shift()! - 1 : n === 10 ? 9 : 0) });
  };
  // first: 6 then 1 -> the luck space (index 7) -> "Go to jail"
  q.push(6, 1);
  play(first, { type: 'roll' }); // 6: moves to 6 (Madrid) and rolls again
  expect(s.phase).toBe('buy');
  play(first, { type: 'decline' });
  expect(s.phase).toBe('roll');
  play(first, { type: 'roll' });
  expect(s.phase).toBe('jailAsk');
  expect(s.players.find((p) => p.id === first)!.jail).toBe(3);
  // cannot roll now
  expect(game.validateMove(s, first, { type: 'roll' }).ok).toBe(false);
  play(first, { type: 'wait' });
  // the other one plays, and the jailed one is skipped three times
  for (let turn = 1; turn <= 3; turn++) {
    expect(s.players[s.turn]!.id).toBe(second);
    expect(game.validateMove(s, first, { type: 'roll' }).ok).toBe(false);
    q.push(3);
    play(second, { type: 'roll' });
    play(second, { type: 'decline' });
  }
  // third skip done: the fourth turn of the other player, then the jailed one plays again
  expect(s.players[s.turn]!.id).toBe(second);
  q.push(3);
  play(second, { type: 'roll' });
  play(second, { type: 'decline' });
  expect(s.players[s.turn]!.id).toBe(first);
  expect(game.validateMove(s, first, { type: 'roll' }).ok).toBe(true);
});
