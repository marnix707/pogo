import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';
import { PixelSuit } from './PixelSuit';

/** Ink and suit colours of the card faces; LINE is the near-black outline (same as `--c-line`). */
const INK = '#1e2b3d';
const RED = '#c14139';
const LINE = '#101628';
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
  const color = showFace && karma.isRedSuit(card) ? RED : INK;
  const rank = showFace ? karma.RANK_LABEL[karma.rankOf(card)] : '';
  const suit = showFace ? karma.suitOf(card) : 0;
  const compact = size < 6.6; // too small for corner indices: show a big centred rank + suit

  const content = showFace ? (
    compact ? (
      <span
        className="flex h-full w-full flex-col items-center justify-center font-bold leading-none"
        style={{ color }}
      >
        <span className="text-[2.7em]">{rank}</span>
        <PixelSuit suit={suit} className="mt-[0.15em] text-[2.3em]" />
      </span>
    ) : (
      <>
        <span
          className="absolute left-[0.45em] top-[0.3em] flex flex-col items-center font-bold leading-none"
          style={{ color }}
        >
          <span className="text-[1.4em]">{rank}</span>
          <PixelSuit suit={suit} className="mt-[0.1em] text-[1.15em]" />
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center text-[1.6em] leading-none"
          style={{ color }}
        >
          <PixelSuit suit={suit} />
        </span>
        <span
          className="absolute bottom-[0.3em] right-[0.45em] flex rotate-180 flex-col items-center font-bold leading-none"
          style={{ color }}
        >
          <span className="text-[1.4em]">{rank}</span>
          <PixelSuit suit={suit} className="mt-[0.1em] text-[1.15em]" />
        </span>
      </>
    )
  ) : null;

  const faceStyle: CSSProperties = showFace
    ? { background: '#f7f1e4', border: `0.2em solid ${LINE}` }
    : {
        // The back: a diamond-patterned blue with a gold frame inside the dark outline.
        background:
          'repeating-linear-gradient(45deg, #009cfd 0 0.45em, #008be3 0.45em 0.9em), #009cfd',
        border: `0.2em solid ${LINE}`,
        boxShadow: `inset 0 0 0 0.22em ${GOLD}`,
      };

  // The outer element is what moves (layout + FLIP); the inner one carries the visual state
  // (lift when selected, tilt, shadow) so those never register as "the card moved".
  const outerStyle: CSSProperties = {
    fontSize: `${size}px`,
    width: '5em',
    height: '7em',
    ...style,
  };
  const inner = (
    <span
      className={`absolute inset-0 rounded-[0.55em] transition-transform duration-150 ${
        selected ? 'card-wobble' : ''
      }`}
      style={{
        ...faceStyle,
        transform: `${selected ? 'translateY(-0.9em) ' : ''}rotate(${tilt}deg)`,
        // (The back keeps its gold frame as an inset shadow, so the lift shadow is added to it.)
        boxShadow: [
          faceStyle.boxShadow,
          selected
            ? `0 0 0 0.25em ${GOLD}, 0 0.3em 0 0.1em rgba(16,22,40,0.7)`
            : '0 0.2em 0 0 rgba(16,22,40,0.6)',
        ]
          .filter(Boolean)
          .join(', '),
        // Unavailable cards are dimmed by 70% (the same as my hand while it is not my turn).
        filter: dimmed ? 'brightness(0.3)' : undefined,
      }}
    >
      {content}
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
