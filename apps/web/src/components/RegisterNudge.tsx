import { useEffect, useState } from 'react';
import type { GameStatsView } from '@pogo/shared';
import { fetchStats } from '../lib/session';
import { Button } from './ui';

/** Shown under a guest's results: a nudge to register so their scores are kept (and listed). */
export function RegisterNudge({
  token,
  gameId,
  onRegister,
}: {
  token: string;
  gameId: string;
  onRegister: () => void;
}) {
  const [stat, setStat] = useState<GameStatsView | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    // The result is saved a moment after the game ends: look again once if it is not there yet.
    const load = (retry: boolean) =>
      fetchStats(token)
        .then((all) => {
          const mine = all.find((s) => s.gameId === gameId) ?? null;
          if (alive) setStat(mine);
          if (!mine && retry && alive) setTimeout(() => void load(false), 1500);
        })
        .catch(() => alive && setStat(null));
    void load(true);
    return () => {
      alive = false;
    };
  }, [token, gameId]);

  if (!stat) return null;
  return (
    <div className="hud flex items-center gap-3 p-3" data-testid="register-nudge">
      <span className="text-3xl" aria-hidden>
        {stat.lastIsBest ? '🔥' : '📈'}
      </span>
      <p className="flex-1 text-sm leading-tight">
        {stat.lastIsBest ? (
          <>
            <b>Wow, great score!</b> Keep track? Register to save it.
          </>
        ) : (
          <>
            <b>Keep your stats?</b> Register to save your wins and join the leaderboard.
          </>
        )}
      </p>
      <Button data-testid="nudge-register" className="!min-h-10 !px-3" onClick={onRegister}>
        Register
      </Button>
    </div>
  );
}
