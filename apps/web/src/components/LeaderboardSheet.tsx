import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@pogo/shared';
import { gameUis } from '../games/registry';
import { fetchLeaderboard } from '../lib/session';
import { AvatarFace } from './AvatarFace';
import { Sheet } from './ui';

export function LeaderboardSheet({
  open,
  onClose,
  me,
  isGuest,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  me: string;
  isGuest: boolean;
  onRegister: () => void;
}) {
  const [game, setGame] = useState(gameUis[0]?.id ?? 'yatzy');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(false);
    fetchLeaderboard(game)
      .then(setRows)
      .catch(() => setError(true));
  }, [open, game]);

  // Yatzy is ranked by best score, the other games by wins.
  const metric = (r: LeaderboardRow) => (game === 'yatzy' ? r.bestScore : r.wins);

  return (
    <Sheet open={open} onClose={onClose} title="Leaderboard">
      <div className="mb-3 flex flex-wrap gap-2">
        {gameUis.map((g) => (
          <button
            key={g.id}
            aria-pressed={game === g.id}
            onClick={() => setGame(g.id)}
            className={`label min-h-9 rounded-md border-2 px-3 ${
              game === g.id ? 'border-accent bg-accent text-accentink' : 'border-edge/50 text-ink'
            }`}
          >
            {g.emoji} {g.name}
          </button>
        ))}
      </div>
      <div className="max-h-[50dvh] overflow-y-auto" data-testid="leaderboard">
        {error ? (
          <p className="text-center text-sm text-muted">Could not load the leaderboard.</p>
        ) : rows === null ? (
          <p className="label text-center text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted" data-testid="leaderboard-empty">
            Nobody is on the board yet. Register and be the first!
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <li
                key={r.userId}
                className={`flex items-center gap-3 rounded-md border-2 px-3 py-1.5 ${
                  r.userId === me ? 'border-neon bg-neon/15' : 'border-edge/30 bg-panel2'
                }`}
              >
                <span className="w-6 text-center font-bold">{i + 1}</span>
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden text-xl">
                  <AvatarFace avatar={r.avatar} fill />
                </span>
                <span className="flex-1 truncate font-bold">{r.nickname}</span>
                <span className="text-xs text-muted">{r.games} played</span>
                <span className="w-12 text-right font-bold tabular-nums">{metric(r)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {isGuest && (
        <button
          type="button"
          data-testid="leaderboard-register"
          onClick={onRegister}
          className="label mt-3 w-full text-center text-muted underline"
        >
          Register to appear on the leaderboard
        </button>
      )}
    </Sheet>
  );
}
