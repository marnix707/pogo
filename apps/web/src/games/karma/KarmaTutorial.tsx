import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../../components/ui';
import { cardFaceUrl } from './cardArt';

const KEY = 'pogo.karmaTutorialSeen';
/** Other parts of the app (the rules sheet) ask the running game to show the tutorial again. */
export const TUTORIAL_EVENT = 'pogo:karma-tutorial';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True until the player has seen (or skipped) the tutorial once; never with reduced motion. */
export function shouldShowTutorial(): boolean {
  if (reducedMotion()) return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable: it may show again next time.
  }
}

// The mock table: cards are 5em x 7em at a fixed font size, placed absolutely so a phase can simply
// give them new coordinates and CSS transitions do the moving.
const FONT = 12;
const W = FONT * 5;
const H = FONT * 7;
const STAGE_W = 300;
const STAGE_H = 290;

/** Card number from rank (2-14) and suit (0 spades, 1 hearts, 2 diamonds, 3 clubs). */
const card = (rank: number, suit: number) => suit * 13 + rank - 2;

interface Sprite {
  id: string;
  card: number;
  x: number;
  y: number;
  lift?: boolean;
  glow?: boolean;
  dim?: boolean;
  float?: boolean;
  z?: number;
}
interface Arrow {
  x: number;
  y: number;
  /** Which way the arrow points. */
  dir: 'up' | 'down';
}
interface Phase {
  caption: string;
  sprites: Sprite[];
  arrow?: Arrow;
  /** A mock button on the stage. */
  button?: { label: string; pressed?: boolean; x: number; y: number };
}
interface Scene {
  title: string;
  phases: Phase[];
}

const FACE_UP_Y = 12;
const HAND_Y = 150;
const COLS = [30, 120, 210];
const arrowUnder = (x: number, y: number): Arrow => ({ x: x + W / 2, y: y + H + 6, dir: 'up' });
const arrowAbove = (x: number, y: number): Arrow => ({ x: x + W / 2, y: y - 34, dir: 'down' });

/** Swap: floating table cards trade places with a hand card. */
function swapScene(): Scene {
  const up = [card(4, 3), card(5, 1), card(9, 2)];
  const hand = [card(6, 0), card(13, 1), card(8, 3)];
  const base = (swapped: boolean, o: { hand?: number; up?: number } = {}): Sprite[] => [
    ...up.map((c, i) => {
      const trade = swapped && i === 1;
      return {
        id: trade ? 'k' : `u${i}`,
        card: trade ? hand[1]! : c,
        x: COLS[i]!,
        y: FACE_UP_Y,
        float: true,
        glow: o.up === i,
        lift: o.up === i,
      };
    }),
    ...hand.map((c, i) => {
      const trade = swapped && i === 1;
      return {
        id: trade ? 'u1' : `h${i}`,
        card: trade ? up[1]! : c,
        x: COLS[i]!,
        y: HAND_Y,
        glow: o.hand === i,
        lift: o.hand === i,
      };
    }),
  ];
  return {
    title: 'Swap your cards',
    phases: [
      {
        caption:
          'The three floating cards are your table cards. You can swap them for cards from your hand.',
        sprites: base(false),
        arrow: arrowAbove(COLS[1]!, FACE_UP_Y),
      },
      {
        caption: 'Tap a card in your hand…',
        sprites: base(false, { hand: 1 }),
        arrow: arrowUnder(COLS[1]!, HAND_Y),
      },
      {
        caption: '…then tap the floating card you want to trade it for.',
        sprites: base(false, { hand: 1, up: 1 }),
        arrow: arrowAbove(COLS[1]!, FACE_UP_Y),
      },
      {
        caption: 'They swap! Strong cards (K, A, 2, 10) are best kept on the table.',
        sprites: base(true),
      },
    ],
  };
}

function readyScene(): Scene {
  const table = [card(4, 3), card(13, 1), card(9, 2)].map((c, i): Sprite => ({
    id: `u${i}`,
    card: c,
    x: COLS[i]!,
    y: FACE_UP_Y + 20,
    float: true,
  }));
  return {
    title: 'Press Ready',
    phases: [
      {
        caption: 'Happy with your table? Press Ready.',
        sprites: table,
        button: { label: 'Ready', x: 100, y: 170 },
        arrow: { x: 150, y: 170 - 34, dir: 'down' },
      },
      {
        caption: 'When everybody is ready, the game starts.',
        sprites: table,
        button: { label: 'Ready', pressed: true, x: 100, y: 170 },
      },
    ],
  };
}

const PILE = { x: 120, y: FACE_UP_Y };

function singleScene(): Scene {
  const pile = (c: number): Sprite => ({ id: 'pile', card: c, ...PILE });
  const hand = (o: { play?: boolean; lift?: boolean } = {}): Sprite[] => [
    { id: 'h0', card: card(5, 2), x: COLS[0]!, y: HAND_Y, dim: true },
    {
      id: 'h1',
      card: card(10, 1),
      x: o.play ? PILE.x : COLS[1]!,
      y: o.play ? PILE.y : HAND_Y,
      lift: o.lift,
      glow: o.lift,
      z: o.play ? 2 : 0,
    },
    { id: 'h2', card: card(13, 0), x: COLS[2]!, y: HAND_Y },
  ];
  return {
    title: 'Play a card',
    phases: [
      {
        caption: 'On your turn, play a card as high as the top card of the pile, or higher.',
        sprites: [pile(card(6, 3)), ...hand()],
        arrow: arrowAbove(PILE.x, PILE.y),
      },
      {
        caption: 'Tap a card to select it, then tap it again to throw it.',
        sprites: [pile(card(6, 3)), ...hand({ lift: true })],
        arrow: arrowUnder(COLS[1]!, HAND_Y),
      },
      {
        caption: 'Boom, it lands on the pile!',
        sprites: [pile(card(6, 3)), ...hand({ play: true })],
      },
    ],
  };
}

function multiScene(): Scene {
  const pile = (c: number): Sprite => ({ id: 'pile', card: c, ...PILE });
  const hand = (o: { sel?: boolean; play?: boolean } = {}): Sprite[] => [
    { id: 'h0', card: card(5, 2), x: COLS[0]!, y: HAND_Y, dim: true },
    {
      id: 'h1',
      card: card(9, 1),
      x: o.play ? PILE.x - 14 : COLS[1]!,
      y: o.play ? PILE.y : HAND_Y,
      lift: o.sel,
      glow: o.sel,
      z: 2,
    },
    {
      id: 'h2',
      card: card(9, 0),
      x: o.play ? PILE.x + 14 : COLS[2]!,
      y: o.play ? PILE.y : HAND_Y,
      lift: o.sel,
      glow: o.sel,
      z: 3,
    },
  ];
  const play = (pressed = false) => ({ label: 'Play 2 cards', pressed, x: 80, y: 250 });
  return {
    title: 'Several of a kind',
    phases: [
      {
        caption: 'Holding more cards of the same rank? You can throw them together.',
        sprites: [pile(card(6, 3)), ...hand()],
        arrow: arrowUnder(COLS[2]!, HAND_Y),
      },
      {
        caption: 'Tap one: they are all selected. Then press Play.',
        sprites: [pile(card(6, 3)), ...hand({ sel: true })],
        button: play(),
        arrow: { x: 150, y: 250 - 34, dir: 'down' },
      },
      {
        caption: 'Both cards go on the pile. Nothing to play? Tap the pile to pick it up.',
        sprites: [pile(card(6, 3)), ...hand({ play: true })],
        button: play(true),
      },
    ],
  };
}

const SCENES: Scene[] = [swapScene(), readyScene(), singleScene(), multiScene()];

/** A chunky pixel arrow; `up` points up, `down` points down. */
function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg
      width="28"
      height="34"
      viewBox="0 0 7 9"
      shapeRendering="crispEdges"
      style={{ transform: dir === 'down' ? 'rotate(180deg)' : undefined }}
      aria-hidden
    >
      <path d="M3 0h1v1h1v1h1v1h-2v6h-2v-6h-2v-1h1v-1h1z" fill="#fda200" />
      <path
        d="M3 0h1v1h1v1h1v1h-2v6h-2v-6h-2v-1h1v-1h1z"
        fill="none"
        stroke="#101628"
        strokeWidth="0.35"
      />
    </svg>
  );
}

function MiniCard({ s }: { s: Sprite }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: s.x,
    top: s.y,
    width: W,
    height: H,
    zIndex: s.z ?? 0,
    transform: `translateY(${s.lift ? -10 : 0}px)`,
    transition: 'left 600ms ease, top 600ms ease, transform 300ms ease, opacity 300ms',
    opacity: s.dim ? 0.4 : 1,
    filter: s.glow ? 'drop-shadow(0 0 6px #fda200) drop-shadow(0 0 2px #fda200)' : undefined,
  };
  return (
    <div style={style}>
      <img
        src={cardFaceUrl(s.card)}
        alt=""
        width={W}
        height={H}
        className={s.float ? 'card-float' : undefined}
        style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
      />
    </div>
  );
}

/**
 * First-time tutorial: a dark screen with a scripted mini table (swap, Ready, play a card, play
 * several). Self-contained, so it never depends on where the real cards are.
 */
export function KarmaTutorial({ onDone }: { onDone: () => void }) {
  // One step at a time, no timers: every tap on the screen (or on Next) goes to the next step,
  // crossing into the next scene when a scene is out of steps.
  const [step, setStep] = useState(0);
  let scene = 0;
  let phase = step;
  while (phase >= SCENES[scene]!.phases.length) phase -= SCENES[scene++]!.phases.length;
  const current = SCENES[scene]!;
  const p = current.phases[phase]!;
  const total = SCENES.reduce((n, sc) => n + sc.phases.length, 0);
  const last = step === total - 1;

  const next = () => (last ? onDone() : setStep(step + 1));

  return (
    <div
      role="dialog"
      aria-label="How to play Karma"
      data-testid="karma-tutorial"
      data-scene={scene}
      data-step={step}
      onClick={next}
      className="fixed inset-0 cursor-pointer z-[80] flex flex-col items-center justify-center gap-3 bg-black/[.97] px-4 text-center text-white"
    >
      <p className="label text-neon">
        {current.title} · {scene + 1}/{SCENES.length}
      </p>

      <div className="relative shrink-0" style={{ width: STAGE_W, height: STAGE_H }} aria-hidden>
        {p.sprites.map((s) => (
          <MiniCard key={s.id} s={s} />
        ))}
        {p.button && (
          <div
            className="absolute"
            style={{
              left: p.button.x,
              top: p.button.y,
              width: 140,
              transform: p.button.pressed ? 'scale(0.9)' : undefined,
              transition: 'transform 150ms',
            }}
          >
            <Button tabIndex={-1} className="pointer-events-none w-full !text-base">
              {p.button.label}
            </Button>
          </div>
        )}
        {p.arrow && (
          <div
            key={`${scene}-${phase}`}
            className="tutorial-arrow absolute"
            data-dir={p.arrow.dir}
            style={{ left: p.arrow.x - 14, top: p.arrow.y }}
          >
            <ArrowIcon dir={p.arrow.dir} />
          </div>
        )}
      </div>

      <p data-testid="tutorial-caption" className="min-h-[4.5rem] max-w-xs text-lg leading-snug">
        {p.caption}
      </p>

      <p className="label text-xs text-white/60">Tap anywhere to continue</p>

      <div className="flex gap-1.5" aria-hidden>
        {SCENES.map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i === scene ? 'bg-neon' : 'bg-white/30'}`}
          />
        ))}
      </div>

      <div className="mt-1 flex gap-3">
        {!last && (
          <Button
            data-testid="tutorial-skip"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
          >
            Skip
          </Button>
        )}
        <Button
          data-testid="tutorial-next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
        >
          {last ? 'Got it!' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
