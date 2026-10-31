import type { PlayerId } from '../../game/types';
import type { BoardConfig, OwnableTile, PropertyTile, Tile } from './config';
import { isOwnable } from './config';
import type { BankruptPlayer, BankruptState } from './types';

/** Pure helpers about the board and the money, used by the game logic and the screen. */

export const tileById = (board: BoardConfig, id: string): Tile | undefined =>
  board.tiles.find((t) => t.id === id);
export const tileIndex = (board: BoardConfig, id: string) =>
  board.tiles.findIndex((t) => t.id === id);

export const playerOf = (s: BankruptState, id: PlayerId): BankruptPlayer | undefined =>
  s.players.find((p) => p.id === id);
export const alivePlayers = (s: BankruptState) => s.players.filter((p) => !p.bankrupt);
export const mover = (s: BankruptState): BankruptPlayer => s.players[s.turn]!;

/** What a building is worth when sold back (half of what it cost). */
export const buildingRefund = (t: PropertyTile) => Math.floor(t.buildCost / 2);

/** The spaces of the same colour set. */
export const groupOf = (board: BoardConfig, tile: PropertyTile): PropertyTile[] =>
  board.tiles.filter((t): t is PropertyTile => t.kind === 'property' && t.group === tile.group);

export const ownsSet = (s: BankruptState, owner: PlayerId, tile: PropertyTile) =>
  groupOf(s.board, tile).every((t) => s.owned[t.id]?.owner === owner);

export const holdingsOf = (s: BankruptState, owner: PlayerId): OwnableTile[] =>
  s.board.tiles.filter((t): t is OwnableTile => isOwnable(t) && s.owned[t.id]?.owner === owner);

export const buildingsOf = (s: BankruptState, owner: PlayerId) =>
  holdingsOf(s, owner).reduce((n, t) => n + (s.owned[t.id]?.level ?? 0), 0);

/** Cash plus what every space and building would sell for: the green number, and the goal. */
export function netWorth(s: BankruptState, id: PlayerId): number {
  const p = playerOf(s, id);
  if (!p || p.bankrupt) return 0;
  let total = p.cash;
  for (const t of holdingsOf(s, id)) {
    total += t.sell;
    if (t.kind === 'property') total += (s.owned[t.id]?.level ?? 0) * buildingRefund(t);
  }
  return total;
}

/** The rent somebody pays for stopping on `tile` (the owner must exist; `dice` is the last roll). */
export function rentOf(s: BankruptState, tile: OwnableTile, dice: [number, number] | null): number {
  const holding = s.owned[tile.id];
  if (!holding) return 0;
  if (tile.kind === 'property') {
    if (holding.level > 0) return tile.rent[Math.min(3, holding.level)] ?? 0;
    return tile.rent[0] * (ownsSet(s, holding.owner, tile) ? 2 : 1);
  }
  if (tile.kind === 'transport') {
    const n = holdingsOf(s, holding.owner).filter((t) => t.kind === 'transport').length;
    return tile.rent[Math.min(n, tile.rent.length) - 1] ?? 0;
  }
  const sum = dice ? dice[0] + dice[1] : 7;
  return tile.rent[0] * sum;
}

/** How many spaces the token moves from `from` to `to` going forward. */
export const stepsBetween = (board: BoardConfig, from: number, to: number) =>
  (to - from + board.tiles.length) % board.tiles.length;
