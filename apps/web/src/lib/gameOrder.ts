import { useCallback, useState } from 'react';
import { gameUis } from '../games/registry';
import type { GameUi } from '../games/types';

const KEY = 'pogo.gameOrder';

const read = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** The games in my own order (A to Z until I move one); games I have never placed come after, A to Z. */
export function orderGames(saved: string[]): GameUi[] {
  const rank = (g: GameUi) => {
    const i = saved.indexOf(g.id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...gameUis].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** My personal order of the games (kept in this browser only). */
export function useGameOrder() {
  const [saved, setSaved] = useState<string[]>(read);
  const setOrder = useCallback((ids: string[]) => {
    setSaved(ids);
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* private window: the order lasts until the page closes */
    }
  }, []);
  const reset = useCallback(() => setOrder([]), [setOrder]);
  return { games: orderGames(saved), setOrder, reset, custom: saved.length > 0 };
}
