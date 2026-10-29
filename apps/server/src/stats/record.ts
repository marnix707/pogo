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
      summary: summary(game),
    }));
  await users.recordResults(rows);
}

/** Who played (best first, with their rank and score) and the game's own facts: the match history entry. */
function summary(game: FinishedGame) {
  const who = new Map(game.roster.map((p) => [p.id, p]));
  return {
    players: game.results.rankings.map((r) => ({
      id: r.playerId,
      nickname: who.get(r.playerId)?.nickname ?? 'Player',
      avatar: who.get(r.playerId)?.avatar ?? '',
      bot: !!who.get(r.playerId)?.bot,
      rank: r.rank,
      score: r.score,
    })),
    detail: game.detail,
  };
}
