import type { UserStore } from '../auth/userStore';
import type { FinishedGame } from '../rooms/Room';

/** Store one result row per human player of a finished game (idempotent per user + match). */
export async function recordFinishedGame(users: UserStore, game: FinishedGame): Promise<void> {
  const humans = new Set(game.humans);
  const rows = game.results.rankings
    .filter((r) => humans.has(r.playerId))
    .map((r) => ({
      userId: r.playerId,
      matchId: game.matchId,
      gameId: game.gameId,
      rank: r.rank,
      score: r.score,
      players: game.players,
      bots: game.bots,
    }));
  await users.recordResults(rows);
}
