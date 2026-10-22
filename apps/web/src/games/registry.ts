import type { GameUi } from './types';
import { karmaUi } from './karma';
import { unoUi } from './uno';
import { yatzyUi } from './yatzy';

/** Game id → UI. Add new games here; the lobby, rooms and shell stay game-agnostic. */
export const gameUis: readonly GameUi[] = [yatzyUi, karmaUi, unoUi];

export const getGameUi = (id: string): GameUi | undefined => gameUis.find((g) => g.id === id);
