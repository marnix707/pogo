import type { AnyGameDefinition } from '../game/types';
import { yatzyGame } from './yatzy';

/** Game id → logic. Add new games here; the server and rooms stay game-agnostic. */
export const gameRegistry: Readonly<Record<string, AnyGameDefinition>> = {
  [yatzyGame.id]: yatzyGame,
};

export function getGame(id: string): AnyGameDefinition | undefined {
  return Object.hasOwn(gameRegistry, id) ? gameRegistry[id] : undefined;
}
