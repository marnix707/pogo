import { describe, expect, it } from 'vitest';
import { orderGames } from './gameOrder';
import { moved } from '../components/SortableList';

describe('game order', () => {
  it('is A to Z until the player moves a game', () => {
    expect(orderGames([]).map((g) => g.name)).toEqual([
      'Bankrupt',
      'Karma',
      'Last Card',
      'Pet Match',
      'Sea Battle',
      'Yatzy',
    ]);
  });
  it('puts the saved games first and the unplaced ones after, A to Z', () => {
    const ids = orderGames(['yatzy', 'karma']).map((g) => g.id);
    expect(ids.slice(0, 2)).toEqual(['yatzy', 'karma']);
    expect(ids).toHaveLength(6);
  });
  it('moves one row', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});
