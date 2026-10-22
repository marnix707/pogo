import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';
import { useCardFlip } from '../../lib/cardFlip';
import type { FlipProps } from '../../lib/cardFlip';
import { cardBackUrl, cardFaceUrl } from './cardArt';

const GOLD = '#fda200';

export { CardFlipContext, resetFlipBoxes } from '../../lib/cardFlip';
export type { FlipOrigin, FlipProps } from '../../lib/cardFlip';

/** A playing card (flat, in the app palette). `card` omitted or `faceDown` shows the back. */
export function PlayingCard({
  card,
  faceDown = false,
  size = 9,
  selected = false,
  dimmed = false,
  tilt = 0,
  float = false,
  onClick,
  className = '',
  style,
  testId,
  label,
  data,
  flip,
}: {
  card?: number;
  faceDown?: boolean;
  /** Pixels per em; the card is 5em wide and 7em tall, so everything scales with this. */
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
  /** Rotation in degrees (a casually tossed card on the pile). */
  tilt?: number;
  /** Gently float and glow ("these are the cards to change"). */
  float?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  label?: string;
  data?: Record<string, string | number | boolean>;
  flip?: FlipProps;
}) {
  const ref = useRef<HTMLElement>(null);
  useCardFlip(ref, flip);

  const showFace = !faceDown && card !== undefined;

  // The outer element is what moves (layout + FLIP); the inner one carries the visual state
  // (lift when selected, tilt, shadow) so those never register as "the card moved". The artwork
  // has its own outline and rounded corners, so the shadow and the selection outline are
  // drop-shadow filters that follow its shape (not a box).
  const outerStyle: CSSProperties = {
    fontSize: `${size}px`,
    width: '5em',
    height: '7em',
    ...style,
  };
  const outline = selected
    ? `drop-shadow(0.15em 0 0 ${GOLD}) drop-shadow(-0.15em 0 0 ${GOLD}) drop-shadow(0 0.15em 0 ${GOLD}) drop-shadow(0 -0.15em 0 ${GOLD}) drop-shadow(0 0.3em 0 rgba(16,22,40,0.7))`
    : 'drop-shadow(0 0.2em 0 rgba(16,22,40,0.6))';
  const inner = (
    <span
      className={`absolute inset-0 transition-transform duration-150 ${selected ? 'card-wobble' : ''}`}
      style={{
        transform: `${selected ? 'translateY(-0.9em) ' : ''}rotate(${tilt}deg)`,
        // Unavailable cards are dimmed by 70% (the same as my hand while it is not my turn).
        filter: `${dimmed ? 'brightness(0.3) ' : ''}${outline}`,
      }}
    >
      <img
        src={showFace ? cardFaceUrl(card) : cardBackUrl}
        alt=""
        draggable={false}
        className="h-full w-full"
        // Pixel art stays sharp when enlarged; downscaled below its native 45px it needs smoothing.
        style={{ imageRendering: size * 5 >= 45 ? 'pixelated' : 'auto' }}
      />
    </span>
  );

  const body = float ? <span className="card-float absolute inset-0 block">{inner}</span> : inner;

  const common = {
    'data-testid': testId,
    'aria-label': label ?? (showFace ? karma.cardLabel(card) : 'Face-down card'),
    // `relative` would override a caller's `absolute` (Tailwind orders it later), so add it only when needed.
    className: `${className.includes('absolute') ? '' : 'relative'} inline-block shrink-0 ${className}`,
    style: outerStyle,
    ...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v])),
  };

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      {...common}
      ref={ref as React.RefObject<HTMLButtonElement>}
    >
      {body}
    </button>
  ) : (
    <span {...common} role="img" ref={ref as React.RefObject<HTMLSpanElement>}>
      {body}
    </span>
  );
}
