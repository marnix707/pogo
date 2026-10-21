import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';
import { cardBackUrl, cardFaceUrl } from './cardArt';

const GOLD = '#fda200';

/** Where a card was last seen on screen (viewport coordinates). */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Where a brand-new card should appear to come from: a box, or a point (it starts small there). */
export type FlipOrigin = Box | { x: number; y: number };

export interface FlipProps {
  /** The card's identity; the same id anywhere on screen is "the same card". */
  id: number;
  /** Where to animate a card from when it has never been seen before (deck, pile, a seat). */
  origin?: () => FlipOrigin | null;
  /** Wait this many ms before flying in from `origin` (staggers a pile pickup). */
  delay?: number;
  /** Flight time in ms (default 320); used to slow down the cards of a multi-card play. */
  duration?: number;
  /** Apply `delay` to cards that merely move (seen before) too, not only to new arrivals. */
  delayMoves?: boolean;
}

/** `enabled` is false for the first paint (no animating the whole table in) and with reduced motion. */
export const CardFlipContext = createContext({ enabled: false });

/** Last known position of every card, wherever it was rendered (hand, table slot, pile...). */
const lastBoxes = new Map<number, Box>();
if (typeof window !== 'undefined') {
  // Positions are viewport-relative, so they are meaningless after a resize/rotation.
  window.addEventListener('resize', () => lastBoxes.clear());
}

/** Forget where every card was (a new game starts: nothing may slide in from the previous one). */
export const resetFlipBoxes = () => lastBoxes.clear();

/** Cards that just unmounted; forgotten for good unless the same card is mounted again right away. */
const gone = new Set<number>();

const MOVE_MS = 320;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

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
  const { enabled } = useContext(CardFlipContext);

  // A card that leaves the screen (picked up into somebody's hidden hand, burned) must not keep an
  // old position: when it shows up again it is a NEW arrival from its owner's seat / the deck, not a
  // slide from wherever it was last seen. Moving between zones unmounts and mounts within one commit,
  // so the position survives that (the mount below un-marks it before the timeout fires).
  const flipId = flip?.id;
  useLayoutEffect(() => {
    if (flipId === undefined) return;
    gone.delete(flipId);
    return () => {
      gone.add(flipId);
      setTimeout(() => {
        if (gone.delete(flipId)) lastBoxes.delete(flipId);
      }, 0);
    };
  }, [flipId]);

  // FLIP: after every render, compare where this card is now with where it was last seen and,
  // if it moved (or just arrived from somewhere), slide it from there. Runs before paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !flip) return;
    const r = el.getBoundingClientRect();
    // A card that is mid-flight reports its animated box. Remember where it really belongs
    // (its layout box), otherwise every re-render during a flight (the turn clock ticks every
    // second) would start a new, wrong slide from the middle of the old one.
    const m = new DOMMatrix(getComputedStyle(el).transform);
    const now: Box = {
      left: r.left - m.e,
      top: r.top - m.f,
      width: m.a ? r.width / m.a : r.width,
      height: m.d ? r.height / m.d : r.height,
    };
    const seen = lastBoxes.get(flip.id);
    lastBoxes.set(flip.id, now);
    if (!enabled || now.width === 0) return;

    let from: Box | null = seen ?? null;
    const delay = !seen || flip.delayMoves ? (flip.delay ?? 0) : 0;
    if (!from) {
      const origin = flip.origin?.();
      if (origin) {
        from =
          'width' in origin
            ? origin
            : {
                left: origin.x - now.width * 0.2,
                top: origin.y - now.height * 0.2,
                width: now.width * 0.4,
                height: now.height * 0.4,
              };
      }
    }
    if (!from) return;

    const dx = from.left - now.left;
    const dy = from.top - now.top;
    const sx = from.width / now.width;
    const sy = from.height / now.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.03) return;
    if (Math.abs(dx) > 2000 || Math.abs(dy) > 2000) return;

    el.animate(
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          zIndex: 40,
        },
        { transformOrigin: 'top left', transform: 'none', zIndex: 40 },
      ],
      { duration: flip.duration ?? MOVE_MS, easing: EASE, delay, fill: 'backwards' },
    );
  });

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
