import type { AdminAnalytics, AnalyticsDay, AnalyticsPeriod } from '@pogo/shared';

/** Everything the dashboard is computed from (the last `HISTORY_DAYS` days). */
export interface AnalyticsRaw {
  activity: { userId: string; day: string; visits: number }[];
  /** When each player first appeared (guest or not). */
  created: { userId: string; at: number }[];
  /** When a guest became a registered account. */
  registered: { at: number }[];
  /** One row per player per game; a match shows up once per player. */
  results: { matchId: string; gameId: string; playedAt: number }[];
}

export const HISTORY_DAYS = 90;
const DAY_MS = 86_400_000;

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shift = (day: string, n: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);

/** The oldest moment the raw data has to cover. */
export const historyStart = (now: number) =>
  Date.parse(`${shift(dayKey(now), -(HISTORY_DAYS - 1))}T00:00:00Z`);

/** The numbers of the Analytics tab, in UTC days. */
export function buildAnalytics(
  raw: AnalyticsRaw,
  info: { now: number; online: number; players: { registered: number; guests: number } },
): AdminAnalytics {
  const today = dayKey(info.now);
  const first = shift(today, -(HISTORY_DAYS - 1));
  const list: string[] = Array.from({ length: HISTORY_DAYS }, (_, i) => shift(first, i));

  const visitorsOn = new Map<string, Set<string>>();
  const visitsOn = new Map<string, number>();
  for (const a of raw.activity) {
    if (!visitorsOn.has(a.day)) visitorsOn.set(a.day, new Set());
    visitorsOn.get(a.day)!.add(a.userId);
    visitsOn.set(a.day, (visitsOn.get(a.day) ?? 0) + a.visits);
  }
  const count = (xs: number[]) => {
    const m = new Map<string, number>();
    for (const at of xs) m.set(dayKey(at), (m.get(dayKey(at)) ?? 0) + 1);
    return m;
  };
  const newPlayersOn = count(raw.created.map((c) => c.at));
  const newAccountsOn = count(raw.registered.map((r) => r.at));
  const matchesOn = new Map<string, Set<string>>();
  for (const r of raw.results) {
    const d = dayKey(r.playedAt);
    if (!matchesOn.has(d)) matchesOn.set(d, new Set());
    matchesOn.get(d)!.add(`${r.gameId}:${r.matchId}`);
  }

  const days: AnalyticsDay[] = list.map((day) => ({
    day,
    visitors: visitorsOn.get(day)?.size ?? 0,
    visits: visitsOn.get(day) ?? 0,
    newPlayers: newPlayersOn.get(day) ?? 0,
    newAccounts: newAccountsOn.get(day) ?? 0,
    games: matchesOn.get(day)?.size ?? 0,
  }));

  /** Add up the days from..to (inclusive); visitors are distinct people over the whole stretch. */
  const period = (from: string, to: string): AnalyticsPeriod => {
    const inside = days.filter((d) => d.day >= from && d.day <= to);
    const people = new Set<string>();
    for (const d of inside) for (const u of visitorsOn.get(d.day) ?? []) people.add(u);
    const sum = (k: 'visits' | 'newPlayers' | 'newAccounts' | 'games') =>
      inside.reduce((n, d) => n + d[k], 0);
    return {
      visitors: people.size,
      visits: sum('visits'),
      newPlayers: sum('newPlayers'),
      newAccounts: sum('newAccounts'),
      games: sum('games'),
    };
  };

  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = shift(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;
  const gamesBy = (from: string) => {
    const m = new Map<string, number>();
    for (const [day, set] of matchesOn) {
      if (day < from) continue;
      for (const key of set) {
        const g = key.slice(0, key.indexOf(':'));
        m.set(g, (m.get(g) ?? 0) + 1);
      }
    }
    return m;
  };
  const gToday = gamesBy(today);
  const gMonth = gamesBy(monthStart);
  const gLast30 = gamesBy(shift(today, -29));
  const gameIds = [...new Set([...gToday.keys(), ...gMonth.keys(), ...gLast30.keys()])];

  // Returning = seen in the last 30 days and first seen before them.
  const since30 = shift(today, -29);
  const createdDay = new Map(raw.created.map((c) => [c.userId, dayKey(c.at)]));
  const recent = new Set<string>();
  for (const [day, set] of visitorsOn) if (day >= since30) for (const u of set) recent.add(u);
  let returning30 = 0;
  for (const u of recent) if ((createdDay.get(u) ?? '0000') < since30) returning30++;

  const firstActivity = raw.activity.reduce<string | null>(
    (min, a) => (min === null || a.day < min ? a.day : min),
    null,
  );

  return {
    days,
    today: period(today, today),
    yesterday: period(shift(today, -1), shift(today, -1)),
    week: period(shift(today, -6), today),
    prevWeek: period(shift(today, -13), shift(today, -7)),
    month: period(monthStart, today),
    lastMonth: period(lastMonthStart, lastMonthEnd),
    last30: period(since30, today),
    prev30: period(shift(today, -59), shift(today, -30)),
    byGame: gameIds
      .map((gameId) => ({
        gameId,
        today: gToday.get(gameId) ?? 0,
        month: gMonth.get(gameId) ?? 0,
        last30: gLast30.get(gameId) ?? 0,
      }))
      .sort((a, b) => b.last30 - a.last30),
    returning30,
    players: info.players,
    trackingSince: firstActivity,
    online: info.online,
  };
}
