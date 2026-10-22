import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { lastcard } from '@pogo/shared';
import { useCardFlip } from '../../lib/cardFlip';
import type { FlipProps } from '../../lib/cardFlip';
import { cardBackUrl, cardFaceUrl } from './cardArt';

/** The four colours of the artist's deck (the same as the dice): red, yellow, green, blue. */
export const CARD_COLORS = ['#fd5f55', '#fda200', '#56a786', '#3aaef7'] as const;

/** One card of the colour-match deck (the artist's SVG), 5em x 7em: set the size with `size` (px per em). */
export function ColourCard({
  card,
  faceDown = false,
  size = 10,
  dimmed = false,
  lifted = false,
  glow = false,
  onClick,
  className = '',
  style,
  flip,
  ...rest
}: {
  card?: lastcard.Card;
  faceDown?: boolean;
  size?: number;
  dimmed?: boolean;
  lifted?: boolean;
  /** A gold outline (e.g. the card you just drew). */
  glow?: boolean;
  onClick?: () => void;
  /** Slide from where this card was last seen (or from `flip.origin`): the same animation as Karma's cards. */
  flip?: FlipProps;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  'data-playable'?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useCardFlip(ref, flip);
  const showBack = faceDown || card === undefined;
  const url = showBack ? cardBackUrl() : cardFaceUrl(card);
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
  ) : null;
  // `relative` is left out when the caller positions the card itself (Tailwind orders it after `absolute`).
  const common = `${className.includes('absolute') ? '' : 'relative'} block shrink-0 select-none ${className}`;
  const label = showBack ? 'Card' : lastcard.cardLabel(card);
  return onClick ? (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
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
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      role="img"
      aria-label={label}
      className={common}
      style={base}
      {...rest}
    >
      {body}
    </span>
  );
}
