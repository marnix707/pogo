import { useState } from 'react';
import type { AdminAnalytics, AnalyticsPeriod } from '@pogo/shared';
import { getGameUi } from '../games/registry';
import { getAnalytics } from './adminApi';
import { useLive } from './useLive';

type Metric = keyof AnalyticsPeriod;
const METRICS: [Metric, string][] = [
  ['visitors', 'Visitors'],
  ['visits', 'Visits'],
  ['newPlayers', 'New players'],
  ['newAccounts', 'New accounts'],
  ['games', 'Games'],
];
const RANGES = [7, 30, 90] as const;

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** "+12 %" / "-5 %" against the comparison period (nothing when there is nothing to compare). */
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0)
    return <span className="text-[10px] opacity-60">{now === 0 ? '–' : 'new'}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span
      className={`text-[10px] font-bold ${pct > 0 ? 'text-[#14673a]' : pct < 0 ? 'text-dangertext' : 'opacity-60'}`}
    >
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} {Math.abs(pct)} %
    </span>
  );
}

function Hero({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: number;
  sub: string;
  delta?: { now: number; before: number };
}) {
  return (
    <div className="hud px-3 py-2">
      <div className="label text-[10px] opacity-80">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {delta && <Delta {...delta} />}
      </div>
      <div className="text-[10px] opacity-60">{sub}</div>
    </div>
  );
}

/** Bars for one metric per day: tap a bar to read its day. */
function Chart({ data, metric, range }: { data: AdminAnalytics; metric: Metric; range: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const days = data.days.slice(-range);
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const shown = picked !== null && days[picked] ? days[picked] : null;
  const W = 300;
  const H = 110;
  const gap = range > 30 ? 0.5 : 1.5;
  const bw = W / days.length;
  return (
    <div data-testid="analytics-chart">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-sm">
        <b data-testid="analytics-readout">
          {shown ? `${fmtDay(shown.day)}: ${shown[metric]}` : `${total} in ${range} days`}
        </b>
        <span className="text-xs opacity-70">
          avg {(total / days.length).toFixed(1)} / day · best {Math.max(...values)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        className="w-full"
        role="img"
        aria-label={`${metric} per day`}
      >
        <line x1="0" x2={W} y1={H} y2={H} stroke="currentColor" strokeOpacity="0.4" />
        {days.map((d, i) => {
          const h = (d[metric] / max) * (H - 6);
          return (
            <g key={d.day} onClick={() => setPicked(picked === i ? null : i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect
                x={i * bw + gap / 2}
                y={H - h}
                width={Math.max(1, bw - gap)}
                height={h}
                rx="1"
                className={picked === i ? 'fill-[#fda200]' : 'fill-[#3cb4ff]'}
              />
            </g>
          );
        })}
        <text x="0" y={H + 11} fontSize="8" fill="currentColor" opacity="0.7">
          {fmtDay(days[0]!.day)}
        </text>
        <text x={W} y={H + 11} fontSize="8" textAnchor="end" fill="currentColor" opacity="0.7">
          {fmtDay(days.at(-1)!.day)}
        </text>
      </svg>
    </div>
  );
}

/** The Analytics tab: how many people come, sign up and play, per day / week / month (UTC days). */
export function Analytics({ onError }: { onError: (m: string) => void }) {
  const data = useLive(getAnalytics, onError, 30000, []);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [metric, setMetric] = useState<Metric>('visitors');
  if (!data) return <p className="label p-4 text-center">Loading…</p>;
  const chip = (active: boolean) =>
    `label rounded-[8px] border-2 px-2.5 py-1.5 ${active ? 'border-neon bg-neon text-accentink' : 'border-edge/50 bg-panel2 text-onbg'}`;
  const { players } = data;
  const all = players.registered + players.guests;
  const pctRegistered = all ? (players.registered / all) * 100 : 0;
  // Visitors of the last 30 days, and which part of them were new that month.
  const returningPct = data.last30.visitors ? (data.returning30 / data.last30.visitors) * 100 : 0;
  const maxGame = Math.max(1, ...data.byGame.map((g) => g.last30));
  return (
    <div className="flex flex-col gap-4" data-testid="admin-analytics">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Hero
          label="Visitors today"
          value={data.today.visitors}
          sub={`${data.online} online now · yesterday ${data.yesterday.visitors}`}
          delta={{ now: data.today.visitors, before: data.yesterday.visitors }}
        />
        <Hero
          label="Visitors, 7 days"
          value={data.week.visitors}
          sub={`previous 7 days: ${data.prevWeek.visitors}`}
          delta={{ now: data.week.visitors, before: data.prevWeek.visitors }}
        />
        <Hero
          label="Monthly visitors"
          value={data.month.visitors}
          sub={`this month · last month ${data.lastMonth.visitors}`}
        />
        <Hero
          label="Visitors, 30 days"
          value={data.last30.visitors}
          sub={`previous 30 days: ${data.prev30.visitors}`}
          delta={{ now: data.last30.visitors, before: data.prev30.visitors }}
        />
      </div>

      <section>
        <h2 className="label mb-1">Overview</h2>
        <div className="hud overflow-x-auto p-2">
          <table className="w-full text-sm tabular-nums" data-testid="analytics-table">
            <thead>
              <tr className="label text-[10px] opacity-80">
                <th className="p-1 text-left" />
                <th className="p-1 text-right">Today</th>
                <th className="p-1 text-right">7 days</th>
                <th className="p-1 text-right">This month</th>
                <th className="p-1 text-right">Last month</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(([key, label]) => (
                <tr key={key} className="border-t border-edge/20">
                  <td className="p-1 font-bold">{label}</td>
                  <td className="p-1 text-right">{data.today[key]}</td>
                  <td className="p-1 text-right">{data.week[key]}</td>
                  <td className="p-1 text-right">{data.month[key]}</td>
                  <td className="p-1 text-right opacity-70">{data.lastMonth[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 px-1 text-[10px] opacity-60">
            Visitors count each player once per period; days are UTC.
            {data.trackingSince
              ? ` Visits are recorded since ${fmtDay(data.trackingSince)}.`
              : ' No visits recorded yet.'}
          </p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2" data-testid="analytics-controls">
          {METRICS.map(([key, label]) => (
            <button
              key={key}
              className={chip(metric === key)}
              onClick={() => setMetric(key)}
              data-testid={`analytics-metric-${key}`}
            >
              {label}
            </button>
          ))}
          <span className="flex-1" />
          {RANGES.map((r) => (
            <button
              key={r}
              className={chip(range === r)}
              onClick={() => setRange(r)}
              data-testid={`analytics-range-${r}`}
            >
              {r} d
            </button>
          ))}
        </div>
        <div className="hud p-3">
          <Chart data={data} metric={metric} range={range} />
        </div>
      </section>

      <section>
        <h2 className="label mb-1">Games per title (last 30 days)</h2>
        <ul className="flex flex-col gap-1.5" data-testid="analytics-games">
          {data.byGame.length === 0 && <li className="p-3 text-center opacity-70">No games yet</li>}
          {data.byGame.map((g) => (
            <li key={g.gameId} className="hud px-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <b className="flex-1">{getGameUi(g.gameId)?.name ?? g.gameId}</b>
                <span className="opacity-70">{g.today} today</span>
                <span className="opacity-70">{g.month} this month</span>
                <b className="w-10 text-right tabular-nums">{g.last30}</b>
              </div>
              <div className="mt-1 h-1.5 rounded bg-edge/20">
                <div
                  className="h-full rounded bg-[#3cb4ff]"
                  style={{ width: `${(g.last30 / maxGame) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="label mb-1">Audience</h2>
        <div className="hud flex flex-col gap-2 p-3 text-sm" data-testid="analytics-audience">
          <div>
            <div className="flex justify-between">
              <span>Registered accounts</span>
              <b className="tabular-nums">
                {players.registered} of {all} ({pctRegistered.toFixed(1)} %)
              </b>
            </div>
            <div className="mt-1 h-1.5 rounded bg-edge/20">
              <div className="h-full rounded bg-[#fda200]" style={{ width: `${pctRegistered}%` }} />
            </div>
            <div className="mt-0.5 text-[10px] opacity-60">
              {players.guests} guests have not registered
            </div>
          </div>
          <div className="flex justify-between">
            <span>Returning visitors (30 days)</span>
            <b className="tabular-nums">
              {data.returning30} of {data.last30.visitors} ({returningPct.toFixed(1)} %)
            </b>
          </div>
          <div className="flex justify-between">
            <span>Games per visitor (30 days)</span>
            <b className="tabular-nums">
              {data.last30.visitors ? (data.last30.games / data.last30.visitors).toFixed(1) : '0.0'}
            </b>
          </div>
        </div>
      </section>
    </div>
  );
}
