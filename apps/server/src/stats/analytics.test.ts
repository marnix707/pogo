import { describe, expect, it } from 'vitest';
import { buildAnalytics, dayKey } from './analytics';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const at = (iso: string) => Date.parse(`${iso}T10:00:00Z`);
const info = { now: NOW, online: 2, players: { registered: 3, guests: 5 } };

describe('buildAnalytics', () => {
  it('counts visitors, new players, accounts and matches per day and per period', () => {
    const a = buildAnalytics(
      {
        activity: [
          { userId: 'a', day: '2026-10-30', visits: 2 },
          { userId: 'b', day: '2026-10-30', visits: 1 },
          { userId: 'a', day: '2026-10-29', visits: 1 },
          { userId: 'c', day: '2026-09-15', visits: 1 },
        ],
        created: [
          { userId: 'a', at: at('2026-10-01') },
          { userId: 'b', at: at('2026-10-30') },
          { userId: 'c', at: at('2026-09-01') },
        ],
        registered: [{ at: at('2026-10-30') }],
        results: [
          // one match with two players is one game
          { matchId: 'm1', gameId: 'yatzy', playedAt: at('2026-10-30') },
          { matchId: 'm1', gameId: 'yatzy', playedAt: at('2026-10-30') },
          { matchId: 'm2', gameId: 'karma', playedAt: at('2026-10-02') },
        ],
      },
      info,
    );
    expect(a.today).toEqual({ visitors: 2, visits: 3, newPlayers: 1, newAccounts: 1, games: 1 });
    expect(a.yesterday.visitors).toBe(1);
    expect(a.week.visitors).toBe(2);
    expect(a.month).toMatchObject({ visitors: 2, newPlayers: 2, games: 2 });
    expect(a.lastMonth).toMatchObject({ visitors: 1, newPlayers: 1 });
    expect(a.days).toHaveLength(90);
    expect(a.days.at(-1)).toMatchObject({ day: '2026-10-30', visitors: 2 });
    expect(a.byGame[0]).toEqual({ gameId: 'yatzy', today: 1, month: 1, last30: 1 });
    // 'a' was created before the last 30 days? No (Oct 1): nobody returns from before.
    expect(a.returning30).toBe(0);
    expect(a.trackingSince).toBe('2026-09-15');
    expect(a.online).toBe(2);
    expect(dayKey(NOW)).toBe('2026-10-30');
  });

  it('counts people who joined before the window and came back', () => {
    const a = buildAnalytics(
      {
        activity: [{ userId: 'old', day: '2026-10-29', visits: 1 }],
        created: [{ userId: 'old', at: at('2026-08-01') }],
        registered: [],
        results: [],
      },
      info,
    );
    expect(a.returning30).toBe(1);
    expect(a.trackingSince).toBe('2026-10-29');
  });
});
