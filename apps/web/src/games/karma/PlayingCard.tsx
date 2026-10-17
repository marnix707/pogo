import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

/** 1em = a fifth of the card's width, so the whole card scales from one font-size. */
export const CARD_FONT: Record<CardSize, number> = { xs: 4.8, sm: 6.6, md: 9, lg: 12.5 };

const NAVY = '#001850';
const RED = '#c4168f';

/** A playing card (flat, in the app palette). `card` omitted or `faceDown` shows the back. */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  selected = false,
  dimmed = false,
  onClick,
  className = '',
  style,
  testId,
  label,
  data,
}: {
  card?: number;
  faceDown?: boolean;
  size?: CardSize;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  label?: string;
  data?: Record<string, string | number | boolean>;
}) {
  const font = CARD_FONT[size];
  const showFace = !faceDown && card !== undefined;
  const color = showFace && karma.isRedSuit(card) ? RED : NAVY;
  const rank = showFace ? karma.RANK_LABEL[karma.rankOf(card)] : '';
  const suit = showFace ? karma.SUIT_SYMBOL[karma.suitOf(card)] : '';

  const base: CSSProperties = {
    fontSize: `${font}px`,
    width: '5em',
    height: '7em',
    transform: selected ? 'translateY(-0.9em)' : undefined,
    boxShadow: selected
      ? '0 0 0 0.25em #FF6BDE, 0 0.3em 0 0.1em rgba(0,24,80,0.45)'
      : '0 0.2em 0 0 rgba(0,24,80,0.35)',
    opacity: dimmed ? 0.4 : 1,
    ...style,
  };

  const content = showFace ? (
    size === 'xs' ? (
      <span
        className="flex h-full w-full flex-col items-center justify-center font-bold leading-none"
        style={{ color }}
      >
        <span className="text-[2.7em]">{rank}</span>
        <span className="text-[2.3em]">{suit}</span>
      </span>
    ) : (
      <>
        <span
          className="absolute left-[0.45em] top-[0.3em] flex flex-col items-center font-bold leading-none"
          style={{ color }}
        >
          <span className="text-[1.55em]">{rank}</span>
          <span className="text-[1.4em]">{suit}</span>
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center text-[3em] leading-none"
          style={{ color }}
        >
          {suit}
        </span>
        <span
          className="absolute bottom-[0.3em] right-[0.45em] flex rotate-180 flex-col items-center font-bold leading-none"
          style={{ color }}
        >
          <span className="text-[1.55em]">{rank}</span>
          <span className="text-[1.4em]">{suit}</span>
        </span>
      </>
    )
  ) : null;

  const faceStyle: CSSProperties = showFace
    ? { background: '#eafefe', border: `0.2em solid ${NAVY}` }
    : {
        background: 'repeating-linear-gradient(45deg, #5B29A7 0 0.45em, #6b38bd 0.45em 0.9em)',
        border: '0.2em solid #1FE0E0',
      };

  const common = {
    'data-testid': testId,
    'aria-label': label ?? (showFace ? karma.cardLabel(card) : 'Face-down card'),
    // `relative` would override a caller's `absolute` (Tailwind orders it later), so add it only when needed.
    className: `${className.includes('absolute') ? '' : 'relative'} inline-block shrink-0 rounded-[0.55em] transition-transform ${className}`,
    style: { ...base, ...faceStyle },
    ...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v])),
  };

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={selected} {...common}>
      {content}
    </button>
  ) : (
    <span {...common} role="img">
      {content}
    </span>
  );
}
