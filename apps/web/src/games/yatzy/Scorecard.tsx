import { yatzy } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { AvatarFace } from '../../components/AvatarFace';
import { DIE_COLOR } from './Die';
import { CATEGORY_HINT, CATEGORY_LABEL, UPPER_FACE } from './labels';

type Category = yatzy.Category;

interface Props {
  state: yatzy.YatzyState;
  members: RoomMemberView[];
  me: string;
  currentIds: string[];
  /** Points each choosable category would score right now (only for the viewer). */
  preview: Partial<Record<Category, number>>;
  /** The dice are still rolling: show "?" instead of the points. */
  previewHidden?: boolean;
  selected: Category | null;
  onSelect: (category: Category) => void;
  /** Stretch the table to this height so the rows fill the space (it still grows if it must). */
  fillHeight?: number;
}

const stickyLabel = 'sticky left-0 z-10';
const rule = 'border-b border-edge/15';
const strongRule = 'border-b-2 border-edge/50';

export function Scorecard({
  state,
  members,
  me,
  currentIds,
  preview,
  previewHidden = false,
  selected,
  onSelect,
  fillHeight,
}: Props) {
  const totals = new Map(
    state.players.map((p) => [p.id, yatzy.getTotals(p.scorecard, p.yatzyBonuses)]),
  );
  const member = (id: string) => members.find((m) => m.id === id);
  // While somebody else is on turn, show in small grey what their dice could score on their card.
  const active = state.players.find((p) => currentIds.includes(p.id) && p.id !== me);
  const otherPreview =
    active && state.dice.length > 0 ? yatzy.getPreviewScores(state.dice, active.scorecard) : {};
  // The +100 row only takes up space once someone has earned it.
  const showYatzyBonus = state.players.some((p) => p.yatzyBonuses > 0);

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
          className={`${stickyLabel} ${rule} h-6 [@media(max-height:640px)]:h-5 whitespace-nowrap px-3 py-0.5 text-left text-sm font-semibold leading-none ${
            isSelected ? 'bg-accent/20' : 'bg-panel'
          }`}
        >
          {UPPER_FACE[category] !== undefined && (
            <span
              aria-hidden
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-baseline"
              style={{ backgroundColor: DIE_COLOR[UPPER_FACE[category]!] }}
            />
          )}
          {CATEGORY_LABEL[category]}
          {CATEGORY_HINT[category] && (
            <span className="ml-1.5 text-[10px] font-medium text-muted">
              {CATEGORY_HINT[category]}
            </span>
          )}
        </th>
        {state.players.map((p) => {
          const value = p.scorecard[category];
          const mine = p.id === me;
          return (
            <td
              key={p.id}
              className={`${rule} h-6 px-1 py-0.5 text-center align-middle [@media(max-height:640px)]:h-5 leading-none tabular-nums ${
                isSelected && mine ? 'bg-accent/20' : currentIds.includes(p.id) ? 'bg-neon/10' : ''
              }`}
            >
              {value !== undefined ? (
                <span className="text-sm font-bold">{value}</span>
              ) : mine && choosable ? (
                <button
                  type="button"
                  data-testid={`pick-${category}`}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(category);
                  }}
                  className={`block min-h-5 [@media(max-height:640px)]:min-h-4 w-full min-w-11 rounded border-2 px-1 text-[13px] font-bold leading-none ${
                    isSelected
                      ? 'border-accent bg-accent text-accentink'
                      : 'border-dashed border-neon text-neon'
                  }`}
                >
                  {previewHidden ? '?' : preview[category]}
                </button>
              ) : p.id === active?.id && category in otherPreview ? (
                <span
                  data-testid={`hint-${category}`}
                  className="text-[11px] font-normal text-muted"
                >
                  {otherPreview[category]}
                </span>
              ) : (
                <span className="text-muted/30">·</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  const computedRow = (
    label: string,
    hint: string,
    value: (id: string) => string,
    style: 'plain' | 'divider' | 'total' = 'plain',
  ) => {
    const total = style === 'total';
    const border = total ? '' : style === 'divider' ? strongRule : rule;
    return (
      <tr>
        <th
          scope="row"
          className={`${stickyLabel} ${border} h-6 [@media(max-height:640px)]:h-5 whitespace-nowrap bg-panel px-3 py-0.5 text-left leading-none ${
            total ? 'text-sm font-bold uppercase tracking-[0.12em]' : 'text-sm font-semibold'
          }`}
        >
          {label}
          {hint && <span className="ml-1.5 text-[10px] font-medium text-muted">{hint}</span>}
        </th>
        {state.players.map((p) => (
          <td
            key={p.id}
            className={`${border} h-6 px-1 py-0.5 text-center align-middle [@media(max-height:640px)]:h-5 leading-none tabular-nums ${
              total ? 'text-base font-bold text-accent' : 'text-sm text-muted'
            }`}
          >
            {value(p.id)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="hud hud-ticks">
      <div className="overflow-x-auto rounded-[4px]">
        <table
          className="w-full border-separate border-spacing-0"
          style={fillHeight ? { height: fillHeight } : undefined}
          data-testid="scorecard"
        >
          <thead>
            <tr>
              <th className={`${stickyLabel} ${strongRule} bg-panel`} />
              {state.players.map((p) => {
                const m = member(p.id);
                const current = currentIds.includes(p.id);
                return (
                  <th
                    key={p.id}
                    data-testid={`player-${p.id}`}
                    className={`${strongRule} min-w-[3.4rem] px-1 py-0.5 text-center ${
                      current ? 'bg-neon/15' : ''
                    }`}
                  >
                    <div
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 bg-panel2 text-xs ${
                        current ? 'border-accent' : 'border-edge/50'
                      } ${m && (!m.connected || m.left) ? 'opacity-40' : ''}`}
                    >
                      <AvatarFace avatar={m?.avatar ?? ''} />
                    </div>
                    <div
                      className={`label mx-auto max-w-[4.5rem] truncate text-[9px] leading-tight tracking-wider ${
                        m?.left ? 'line-through opacity-60' : ''
                      }`}
                    >
                      {p.id === me ? 'You' : (m?.nickname ?? '?')}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {yatzy.UPPER_CATEGORIES.map(row)}
            {computedRow(
              'Bonus',
              `${totals.get(me)?.upperSubtotal ?? 0}/${yatzy.UPPER_BONUS_THRESHOLD} · +${yatzy.UPPER_BONUS}`,
              (id) => {
                const t = totals.get(id)!;
                return t.upperBonus > 0 ? `+${t.upperBonus}` : String(t.upperSubtotal);
              },
            )}
            <tr aria-hidden>
              <td colSpan={state.players.length + 1} className="h-1.5 bg-edge/20 p-0" />
            </tr>
            {yatzy.LOWER_CATEGORIES.map(row)}
            {showYatzyBonus &&
              computedRow('Yatzy bonus', '+100 each', (id) => {
                const b = totals.get(id)!.yatzyBonus;
                return b > 0 ? `+${b}` : '–';
              })}
            {computedRow('Total', '', (id) => String(totals.get(id)!.grandTotal), 'total')}
          </tbody>
        </table>
      </div>
    </div>
  );
}
