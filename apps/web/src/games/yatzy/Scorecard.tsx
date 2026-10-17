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

const stickyLabel = 'sticky left-0 z-10';

export function Scorecard({ state, members, me, currentIds, preview, selected, onSelect }: Props) {
  const totals = new Map(
    state.players.map((p) => [p.id, yatzy.getTotals(p.scorecard, p.yatzyBonuses)]),
  );
  const member = (id: string) => members.find((m) => m.id === id);
  const rule = 'border-b border-edge/15';

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
          className={`${stickyLabel} ${rule} px-3 py-1.5 text-left font-semibold ${
            isSelected ? 'bg-accent/20' : 'bg-panel'
          }`}
        >
          <div className="leading-tight">{CATEGORY_LABEL[category]}</div>
          {CATEGORY_HINT[category] && (
            <div className="label text-[9px] font-medium text-muted">{CATEGORY_HINT[category]}</div>
          )}
        </th>
        {state.players.map((p) => {
          const value = p.scorecard[category];
          const mine = p.id === me;
          return (
            <td
              key={p.id}
              className={`${rule} px-1 py-1 text-center tabular-nums ${
                isSelected && mine ? 'bg-accent/20' : currentIds.includes(p.id) ? 'bg-neon/10' : ''
              }`}
            >
              {value !== undefined ? (
                <span className={value === 0 ? 'text-muted/60' : 'font-bold'}>{value}</span>
              ) : mine && choosable ? (
                <button
                  type="button"
                  data-testid={`pick-${category}`}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(category);
                  }}
                  className={`min-h-10 w-full min-w-11 rounded-md border-2 px-1 font-bold ${
                    isSelected
                      ? 'border-accent bg-accent text-accentink'
                      : 'border-dashed border-neon text-neon'
                  }`}
                >
                  {preview[category]}
                </button>
              ) : (
                <span className="text-muted/30">·</span>
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
        className="label bg-lagoon/30 px-3 py-1 text-left text-[10px] text-neon"
      >
        {title}
      </th>
    </tr>
  );

  const computedRow = (
    label: string,
    hint: string,
    value: (id: string) => string,
    total = false,
  ) => (
    <tr>
      <th
        scope="row"
        className={`${stickyLabel} bg-panel px-3 py-1.5 text-left ${total ? '' : rule}`}
      >
        <div
          className={`leading-tight ${total ? 'text-base font-bold uppercase tracking-[0.12em]' : 'font-semibold'}`}
        >
          {label}
        </div>
        {hint && <div className="label text-[9px] font-medium text-muted">{hint}</div>}
      </th>
      {state.players.map((p) => (
        <td
          key={p.id}
          className={`px-1 py-1.5 text-center tabular-nums ${total ? 'text-xl font-bold text-accent' : `${rule} text-muted`}`}
        >
          {value(p.id)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="hud hud-ticks">
      <div className="overflow-x-auto rounded-[4px]">
        <table className="w-full border-separate border-spacing-0 text-sm" data-testid="scorecard">
          <thead>
            <tr>
              <th className={`${stickyLabel} bg-panel`} />
              {state.players.map((p) => {
                const m = member(p.id);
                const current = currentIds.includes(p.id);
                return (
                  <th
                    key={p.id}
                    data-testid={`player-${p.id}`}
                    className={`min-w-[3.4rem] px-1 py-2 text-center ${current ? 'bg-neon/15' : ''}`}
                  >
                    <div
                      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 bg-panel2 text-xl ${
                        current ? 'border-accent' : 'border-edge/50'
                      } ${m && (!m.connected || m.left) ? 'opacity-40' : ''}`}
                    >
                      {avatarEmoji(m?.avatar ?? '')}
                    </div>
                    <div className="label mx-auto mt-1 max-w-[4.5rem] truncate text-[10px] tracking-wider">
                      {p.id === me ? 'You' : (m?.nickname ?? '?')}
                    </div>
                    {m && m.left ? (
                      <div className="label text-[9px] text-muted">left</div>
                    ) : (
                      m && !m.connected && <div className="label text-[9px] text-muted">away</div>
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
            {computedRow('Yatzy bonus', '+100 per extra Yatzy', (id) => {
              const b = totals.get(id)!.yatzyBonus;
              return b > 0 ? `+${b}` : '–';
            })}
            {computedRow('Total', '', (id) => String(totals.get(id)!.grandTotal), true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
