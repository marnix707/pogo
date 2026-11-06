import type { GameUi } from './types';
import { bankruptUi } from './bankrupt';
import { karmaUi } from './karma';
import { lastCardUi } from './lastcard';
import { matchMatesUi } from './matchmates';
import { seaBattleUi } from './seabattle';
import { yatzyUi } from './yatzy';

/** Game id → UI. Add new games here; the lobby, rooms and shell stay game-agnostic. Listed A to Z by name. */
export const gameUis: readonly GameUi[] = [
  bankruptUi,
  karmaUi,
  lastCardUi,
  matchMatesUi,
  seaBattleUi,
  yatzyUi,
].sort((a, b) => a.name.localeCompare(b.name));

export const getGameUi = (id: string): GameUi | undefined => gameUis.find((g) => g.id === id);
