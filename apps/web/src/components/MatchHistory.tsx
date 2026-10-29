import { useEffect, useState } from 'react';
import type { MatchHistoryEntry } from '@pogo/shared';
import { getGameUi } from '../games/registry';
import { fetchHistory } from '../lib/session';
import { Avatar } from './ui';
import { PlayerName } from './PlayerName';

/** "5 min ago", "3 h ago", "yesterday", "12 Oct". */
export function timeAgo(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The last ten games: who you played, how it ended, and what the game itself wants to tell about it. */
export function MatchHistory({ token, me }: { token: string; me: string }) {
  const [rows, setRows] = useState<MatchHistoryEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setRows(null);
    setError(false);
    fetchHistory(token)
      .then(setRows)
      .catch(() => setError(true));
  }, [token]);

  if (error)
    return <p className="text-center text-sm text-muted">Could not load your match history.</p>;
  if (rows === null) return <p className="label text-center text-muted">Loading…</p>;
  if (rows.length === 0)
    return (
      <p className="text-center text-sm text-muted" data-testid="history-empty">
        No games yet. Play one and it shows up here.
      </p>
    );
  return (
    <ol className="flex flex-col gap-2" data-testid="match-history">
      {rows.map((entry) => {
        const ui = getGameUi(entry.gameId);
        const mine = entry.players.find((p) => p.id === me);
        const won = mine?.rank === 1;
        const scoreText = ui?.scoreText ?? ((n: number) => String(n));
        return (
          <li
            key={entry.matchId}
            data-testid="history-row"
            className={`rounded-md border-2 px-3 py-2 ${won ? 'border-neon bg-neon/10' : 'border-edge/30 bg-panel2'}`}
          >
            <div className="flex items-center gap-2">
              {ui?.logo ? (
                <img
                  src={ui.logo}
                  alt={ui.name}
                  className="h-8 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="font-bold">{ui?.name ?? entry.gameId}</span>
              )}
              <span className="flex-1" />
              <span className="label text-[10px] text-muted">{timeAgo(entry.playedAt)}</span>
              <span
                data-testid="history-result"
                className={`label rounded px-2 py-0.5 text-[11px] ${won ? 'bg-neon text-accentink' : 'bg-black/30 text-ink'}`}
              >
                {mine
                  ? won
                    ? 'Won'
                    : mine.rank === entry.players.length
                      ? 'Lost'
                      : `#${mine.rank}`
                  : '?'}
              </span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {entry.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center text-xs text-muted tabular-nums">{p.rank}</span>
                  <Avatar avatar={p.avatar} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold">
                    <PlayerName name={p.id === me ? 'You' : p.nickname} id={p.id} me={me} />
                  </span>
                  <span className="font-bold tabular-nums">{scoreText(p.score)}</span>
                </li>
              ))}
            </ul>
            {ui?.historyDetail?.(entry)}
          </li>
        );
      })}
    </ol>
  );
}
