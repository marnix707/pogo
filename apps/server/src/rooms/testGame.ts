import { z } from 'zod';
import type { GameDefinition } from '@pogo/shared';

/** Minimal fake game for exercising the room system without any real game's rules. */
interface RaceState {
  order: string[];
  turn: number;
  steps: Record<string, number>;
  secrets: Record<string, number>;
}
interface RaceView {
  order: string[];
  turn: number;
  steps: Record<string, number>;
  mySecret: number | undefined;
}
type RaceMove = { type: 'step' };

export const GOAL = 3;

export const raceGame: GameDefinition<RaceState, RaceMove, Record<string, never>, RaceView> = {
  id: 'race',
  name: 'Race',
  minPlayers: 2,
  maxPlayers: 3,
  optionsSchema: z.object({}).strict() as z.ZodType<Record<string, never>, z.ZodTypeDef, unknown>,
  defaultOptions: {},
  moveSchema: z.object({ type: z.literal('step') }),
  createInitialState: (players, _o, rng) => ({
    order: players.map((p) => p.id),
    turn: 0,
    steps: Object.fromEntries(players.map((p) => [p.id, 0])),
    secrets: Object.fromEntries(players.map((p) => [p.id, rng.int(1000)])),
  }),
  validateMove: (s, id) =>
    s.order[s.turn % s.order.length] === id ? { ok: true } : { ok: false, error: 'Not your turn' },
  applyMove: (s, id) => ({
    ...s,
    turn: s.turn + 1,
    steps: { ...s.steps, [id]: (s.steps[id] ?? 0) + 1 },
  }),
  getPlayerView: (s, id) => ({
    order: s.order,
    turn: s.turn,
    steps: s.steps,
    mySecret: s.secrets[id],
  }),
  getCurrentPlayers: (s) =>
    Object.values(s.steps).some((n) => n >= GOAL) ? [] : [s.order[s.turn % s.order.length]!],
  isGameOver: (s) => Object.values(s.steps).some((n) => n >= GOAL),
  getResults: (s) => {
    const ranked = Object.entries(s.steps).sort((a, b) => b[1] - a[1]);
    return {
      rankings: ranked.map(([playerId, score]) => ({
        playerId,
        score,
        rank: ranked.findIndex((r) => r[1] === score) + 1,
      })),
    };
  },
  autoMove: () => ({ move: { type: 'step' }, endsTurn: true }),
};

export const testGames = { race: raceGame } as const;
