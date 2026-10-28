import type { AnyGameDefinition } from '../game/types';
import { karmaGame } from './karma';
import { lastCardGame } from './lastcard';
import { matesGame } from './matchmates';
import { seaBattleGame } from './seabattle';
import { yatzyGame } from './yatzy';

/** Game id → logic. Add new games here; the server and rooms stay game-agnostic. */
export const gameRegistry: Readonly<Record<string, AnyGameDefinition>> = {
  [yatzyGame.id]: yatzyGame,
  [karmaGame.id]: karmaGame,
  [lastCardGame.id]: lastCardGame,
  [seaBattleGame.id]: seaBattleGame,
  [matesGame.id]: matesGame,
};

export function getGame(id: string): AnyGameDefinition | undefined {
  return Object.hasOwn(gameRegistry, id) ? gameRegistry[id] : undefined;
}
