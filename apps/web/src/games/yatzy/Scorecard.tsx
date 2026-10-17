import { Fragment } from 'react';
import { yatzy } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { avatarEmoji } from '../../lib/avatars';
import { CATEGORY_HINT, CATEGORY_LABEL } from './labels';

type Category = yatzy.Category;

interface Props {
  state: yatzy.YatzyState;
  members: RoomMemberView[];
  me: string;
  currentIds: string[];
  /** Points each choosable category would score right now (only for the viewer). */
  preview: Partial<Record<Category, number>>;
  selected: Category | null;
  onSelect: (category: Category) => void;
}

const sticky = 'sticky left-0 z-10';

export function Scorecard({ state, members, me, currentIds, preview, selected, onSelect }: Props) {
  const totals = new Map(
    state.players.map((p) => [p.id, yatzy.getTotals(p.scorecard, p.yatzyBonuses)]),
  );
  const member = (id: string) => members.find((m) => m.id === id);

  function row(category: Category) {
    const choosable = category in preview;
    const isSelected = selected === category;
    return (
      <tr
        key={category}
        data-testid={`row-${category}`}
        onClick={choosable ? () => onSelect(category) : undefined}
        className={choosable ? 'cursor-pointer' : ''}
      >
        <th
          scope="row"
          className={`${sticky} px-3 py-1.5 text-left font-semibold ${
            isSelected ? 'bg-violet-100 dark:bg-violet-950' : 'bg-white dark:bg-slate-900'
          }`}
        >
          <div className="leading-tight">{CATEGORY_LABEL[category]}</div>
          <div className="text-[11px] font-normal text-slate-400">{CATEGORY_HINT[category]}</div>
        </th>
        {state.players.map((p) => {
          const value = p.scorecard[category];
          const mine = p.id === me;
          return (
            <td
              key={p.id}
              className={`px-1 py-1 text-center tabular-nums ${
                isSelected && mine ? 'bg-violet-100 dark:bg-violet-950' : ''
              } ${currentIds.includes(p.id) ? 'bg-violet-50/70 dark:bg-slate-800/60' : ''}`}
            >
              {value !== undefined ? (
                <span className={value === 0 ? 'text-slate-400' : 'font-bold'}>{value}</span>
              ) : mine && choosable ? (
                <button
                  type="button"
                  data-testid={`pick-${category}`}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(category);
                  }}
                  className={`min-h-10 w-full min-w-11 rounded-xl px-1 font-black ${
                    isSelected
                      ? 'bg-violet-600 text-white'
                      : 'border-2 border-dashed border-violet-400 text-violet-600 dark:text-violet-300'
                  }`}
                >
                  {preview[category]}
                </button>
              ) : (
                <span className="text-slate-300 dark:text-slate-700">·</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  const sectionRow = (title: string) => (
    <tr>
      <th
        colSpan={state.players.length + 1}
        className="bg-slate-100 px-3 py-1 text-left text-xs font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      >
        {title}
      </th>
    </tr>
  );

  const computedRow = (
    label: string,
    hint: string,
    value: (id: string) => string,
    bold = false,
  ) => (
    <tr>
      <th scope="row" className={`${sticky} bg-white px-3 py-1.5 text-left dark:bg-slate-900`}>
        <div className={`leading-tight ${bold ? 'font-black' : 'font-semibold'}`}>{label}</div>
        {hint && <div className="text-[11px] font-normal text-slate-400">{hint}</div>}
      </th>
      {state.players.map((p) => (
        <td
          key={p.id}
          className={`px-1 py-1.5 text-center tabular-nums ${bold ? 'text-lg font-black' : 'text-slate-500'}`}
        >
          {value(p.id)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="overflow-x-auto rounded-3xl bg-white shadow-sm dark:bg-slate-900">
      <table className="w-full border-separate border-spacing-0 text-sm" data-testid="scorecard">
        <thead>
          <tr>
            <th className={`${sticky} bg-white dark:bg-slate-900`} />
            {state.players.map((p) => {
              const m = member(p.id);
              const current = currentIds.includes(p.id);
              return (
                <th
                  key={p.id}
                  data-testid={`player-${p.id}`}
                  className={`min-w-[3.4rem] px-1 py-2 text-center ${
                    current ? 'rounded-t-2xl bg-violet-100 dark:bg-violet-950' : ''
                  }`}
                >
                  <div className={`text-xl ${m && (!m.connected || m.left) ? 'opacity-40' : ''}`}>
                    {avatarEmoji(m?.avatar ?? '')}
                  </div>
                  <div className="max-w-[4.5rem] truncate text-[11px] font-bold leading-tight">
                    {p.id === me ? 'You' : (m?.nickname ?? '?')}
                  </div>
                  {m && m.left ? (
                    <div className="text-[10px] font-normal text-slate-400">left</div>
                  ) : (
                    m &&
                    !m.connected && (
                      <div className="text-[10px] font-normal text-slate-400">away</div>
                    )
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sectionRow('Upper section')}
          {yatzy.UPPER_CATEGORIES.map(row)}
          {computedRow(
            'Bonus',
            `+${yatzy.UPPER_BONUS} at ${yatzy.UPPER_BONUS_THRESHOLD}+`,
            (id) => {
              const t = totals.get(id)!;
              return t.upperBonus > 0
                ? `+${t.upperBonus}`
                : `${t.upperSubtotal}/${yatzy.UPPER_BONUS_THRESHOLD}`;
            },
          )}
          {sectionRow('Lower section')}
          {yatzy.LOWER_CATEGORIES.map(row)}
          <Fragment>
            {computedRow('Yatzy bonus', '+100 per extra Yatzy', (id) => {
              const b = totals.get(id)!.yatzyBonus;
              return b > 0 ? `+${b}` : '–';
            })}
            {computedRow('Total', '', (id) => String(totals.get(id)!.grandTotal), true)}
          </Fragment>
        </tbody>
      </table>
    </div>
  );
}
