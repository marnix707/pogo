import type { GameUi } from './types';
import { bankruptUi } from './bankrupt';
import { karmaUi } from './karma';
import { lastCardUi } from './lastcard';
import { matchMatesUi } from './matchmates';
import { seaBattleUi } from './seabattle';
import { yatzyUi } from './yatzy';

/** Game id → UI. Add new games here; the lobby, rooms and shell stay game-agnostic. */
export const gameUis: readonly GameUi[] = [
  yatzyUi,
  karmaUi,
  lastCardUi,
  seaBattleUi,
  matchMatesUi,
  bankruptUi,
];

export const getGameUi = (id: string): GameUi | undefined => gameUis.find((g) => g.id === id);
