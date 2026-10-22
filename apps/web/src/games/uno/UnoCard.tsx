import type { CSSProperties } from 'react';
import { uno } from '@pogo/shared';
import { unoBackUrl, unoFaceUrl } from './cardArt';

export const UNO_COLORS = ['#d9382f', '#f2b600', '#3a9d5d', '#2b6fcf'] as const;
const INK = '#101628';

const SYMBOL: Record<string, string> = { skip: '⊘', reverse: '⇄', draw2: '+2', wild4: '+4' };

function symbolOf(card: uno.Card): string {
  const info = uno.cardInfo(card);
  return info.kind === 'number' ? String(info.value) : (SYMBOL[info.kind] ?? '');
}

/** Placeholder face: a coloured card with a white oval and the symbol (until the SVG exists). */
function PlaceholderFace({ card }: { card: uno.Card }) {
  const info = uno.cardInfo(card);
  const wild = info.color === null;
  const color = wild ? INK : UNO_COLORS[info.color!];
  const symbol = symbolOf(card);
  return (
    <span
      className="absolute inset-0 block overflow-hidden rounded-[0.55em]"
      style={{ background: color, border: '0.22em solid #fff' }}
    >
      <span
        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] overflow-hidden rounded-[50%]"
        style={{ width: '78%', height: '58%', background: wild ? INK : '#fff' }}
      >
        {wild && (
          <span className="absolute inset-0 grid grid-cols-2 grid-rows-2">
            {UNO_COLORS.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </span>
        )}
      </span>
      {symbol && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold leading-none"
          style={{
            fontSize: symbol.length > 1 || info.kind !== 'number' ? '2.1em' : '3.2em',
            color: wild ? '#fff' : color,
            textShadow: wild ? '0 0 0.12em #000' : '0.06em 0.06em 0 rgb(0 0 0 / 0.25)',
          }}
        >
          {symbol}
        </span>
      )}
      {symbol && (
        <>
          <span
            className="absolute left-[0.35em] top-[0.2em] font-bold leading-none text-white"
            style={{ fontSize: '0.95em' }}
          >
            {symbol}
          </span>
          <span
            className="absolute bottom-[0.2em] right-[0.35em] rotate-180 font-bold leading-none text-white"
            style={{ fontSize: '0.95em' }}
          >
            {symbol}
          </span>
        </>
      )}
    </span>
  );
}

function PlaceholderBack() {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[0.55em]"
      style={{ background: INK, border: '0.22em solid #fff' }}
    >
      <span
        className="flex -rotate-[24deg] items-center justify-center rounded-[50%] font-bold leading-none"
        style={{
          width: '80%',
          height: '58%',
          background: UNO_COLORS[0],
          color: UNO_COLORS[1],
          fontSize: '1.25em',
          letterSpacing: '0.04em',
        }}
      >
        UNO
      </span>
    </span>
  );
}

/** One UNO card, 5em x 7em: set the size with `size` (px per em). */
export function UnoCard({
  card,
  faceDown = false,
  size = 10,
  dimmed = false,
  lifted = false,
  glow = false,
  onClick,
  className = '',
  style,
  ...rest
}: {
  card?: uno.Card;
  faceDown?: boolean;
  size?: number;
  dimmed?: boolean;
  lifted?: boolean;
  /** A gold outline (e.g. the card you just drew). */
  glow?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  'data-playable'?: boolean;
}) {
  const showBack = faceDown || card === undefined;
  const url = showBack ? unoBackUrl() : unoFaceUrl(card);
  const filters = [
    dimmed ? 'brightness(0.4)' : '',
    glow ? 'drop-shadow(0 0 0.18em #fda200) drop-shadow(0 0 0.1em #fda200)' : '',
    !glow && lifted ? 'drop-shadow(0 0.4em 0.35em rgb(0 0 0 / 0.5))' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const base: CSSProperties = {
    fontSize: size,
    width: '5em',
    height: '7em',
    filter: filters || undefined,
    transform: lifted ? 'translateY(-0.9em)' : undefined,
    transition: 'transform 140ms, filter 140ms',
    ...style,
  };
  const body = url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  ) : showBack ? (
    <PlaceholderBack />
  ) : (
    <PlaceholderFace card={card} />
  );
  // `relative` is left out when the caller positions the card itself (Tailwind orders it after `absolute`).
  const common = `${className.includes('absolute') ? '' : 'relative'} block shrink-0 select-none ${className}`;
  const label = showBack ? 'Card' : uno.cardLabel(card);
  return onClick ? (
    <button
      type="button"
      aria-label={label}
      className={common}
      style={base}
      onClick={onClick}
      {...rest}
    >
      {body}
    </button>
  ) : (
    <span role="img" aria-label={label} className={common} style={base} {...rest}>
      {body}
    </span>
  );
}
