import type { GameUi } from './types';
import { karmaUi } from './karma';
import { yatzyUi } from './yatzy';

/** Game id → UI. Add new games here; the lobby, rooms and shell stay game-agnostic. */
export const gameUis: readonly GameUi[] = [yatzyUi, karmaUi];

export const getGameUi = (id: string): GameUi | undefined => gameUis.find((g) => g.id === id);
