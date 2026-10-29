import { PlayerName } from './PlayerName';
import { ProfileTap } from '../friends/ProfileTap';
import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@pogo/shared';
import { gameUis } from '../games/registry';
import { fetchLeaderboard } from '../lib/session';
import { MatchHistory } from './MatchHistory';
import { Avatar, Sheet } from './ui';

export function LeaderboardSheet({
  open,
  onClose,
  me,
  token,
  isGuest,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  me: string;
  token: string;
  isGuest: boolean;
  onRegister: () => void;
}) {
  // The trophy button opens the leaderboard; the second tab is your match history (the last ten games).
  const [tab, setTab] = useState<'board' | 'history'>('board');
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
    <Sheet
      open={open}
      onClose={onClose}
      title={tab === 'board' ? 'Leaderboard' : 'Match history'}
      full
    >
      <div
        className="mb-4 grid grid-cols-2 gap-1.5 rounded-lg border-2 border-accent bg-[#1b2c4d] p-1.5"
        role="tablist"
        data-testid="board-tabs"
      >
        {(
          [
            ['board', 'Leaderboard'],
            ['history', 'Match history'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`board-tab-${id}`}
            onClick={() => setTab(id)}
            className={`min-h-12 rounded-md border-2 px-3 text-sm font-bold uppercase tracking-[0.1em] ${
              tab === id
                ? 'border-accent bg-accent text-accentink shadow-[0_3px_0_#0081d3]'
                : 'border-transparent text-[#f7f1e4]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'history' && (
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="history-tab">
          <MatchHistory token={token} me={me} />
        </div>
      )}
      {tab === 'board' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {gameUis.map((g) => (
              <button
                key={g.id}
                aria-pressed={game === g.id}
                onClick={() => setGame(g.id)}
                className={`label min-h-9 rounded-md border-2 px-3 ${
                  game === g.id
                    ? 'border-accent bg-accent text-accentink'
                    : 'border-edge/50 text-ink'
                }`}
              >
                {g.emoji} {g.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="leaderboard">
            {error ? (
              <p className="text-center text-sm text-muted">Could not load the leaderboard.</p>
            ) : rows === null ? (
              <p className="label text-center text-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-center text-sm text-muted" data-testid="leaderboard-empty">
                Nobody is on the board yet. Register and be the first!
              </p>
            ) : (
              <>
                <div
                  className="label flex items-center gap-2 px-2 pb-1 text-[10px] text-muted"
                  data-testid="leaderboard-header"
                >
                  <span className="w-6 text-center">#</span>
                  <span className="w-8" />
                  <span className="flex-1">Player</span>
                  <span className="w-11 shrink-0 whitespace-nowrap text-right">Played</span>
                  <span className="w-9 shrink-0 whitespace-nowrap text-right">
                    {game === 'yatzy' ? 'Best' : 'Wins'}
                  </span>
                </div>
                <ol className="flex flex-col gap-1.5">
                  {rows.map((r, i) => (
                    <li
                      key={r.userId}
                      className={`flex items-center gap-2 rounded-md border-2 px-2 py-1.5 ${
                        r.userId === me ? 'border-neon bg-neon/15' : 'border-edge/30 bg-panel2'
                      }`}
                    >
                      <span className="w-6 text-center font-bold">{i + 1}</span>
                      <ProfileTap id={r.userId} me={me}>
                        <Avatar avatar={r.avatar} size="sm" />
                      </ProfileTap>
                      <span className="min-w-0 flex-1 font-bold leading-tight [overflow-wrap:anywhere]">
                        <PlayerName name={r.nickname} />
                      </span>
                      <span className="w-11 shrink-0 text-right text-sm text-muted tabular-nums">
                        {r.games}
                      </span>
                      <span className="w-9 shrink-0 text-right font-bold tabular-nums">
                        {metric(r)}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </>
      )}
      {tab === 'board' && isGuest && (
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
