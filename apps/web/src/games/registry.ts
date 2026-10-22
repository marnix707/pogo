import type { GameUi } from './types';
import { karmaUi } from './karma';
import { lastCardUi } from './lastcard';
import { yatzyUi } from './yatzy';

/** Game id → UI. Add new games here; the lobby, rooms and shell stay game-agnostic. */
export const gameUis: readonly GameUi[] = [yatzyUi, karmaUi, lastCardUi];

export const getGameUi = (id: string): GameUi | undefined => gameUis.find((g) => g.id === id);
