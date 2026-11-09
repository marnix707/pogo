import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Sheet } from './ui';

/**
 * The building blocks of every game's "How to play" page (the page of Pet Match was the first): a full sheet of
 * titled blocks, each a small looping demo and a line or two. Demos are little state machines: `useLoop` walks
 * through their steps and the pictures move with CSS transitions. With reduced motion nothing loops: the demo
 * sits on its `rest` step, a picture that already shows the point.
 */
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The current step of a looping demo: `durations[i]` ms on step i, then the next, then round again. */
export function useLoop(durations: number[], rest = durations.length - 1): number {
  const [step, setStep] = useState(() => (reduced() ? rest : 0));
  useEffect(() => {
    if (reduced()) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const go = () => {
      setStep(i);
      timer = setTimeout(() => {
        i = (i + 1) % durations.length;
        go();
      }, durations[i]);
    };
    go();
    return () => clearTimeout(timer);
    // (the durations are written out where the demo is: they never change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return step;
}

/** The page: a full-height sheet with the blocks one under the other. */
export function RulesSheet({
  open,
  onClose,
  title,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} full>
      <div className="flex flex-col gap-5 pb-4" data-testid={testId}>
        {children}
      </div>
    </Sheet>
  );
}

/** A titled block of the page: one picture / animation and a line or two. */
export function Block({
  title,
  children,
  line,
}: {
  title: string;
  children: ReactNode;
  line: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="label text-neon">{title}</h3>
      <div className="hud flex items-center justify-center !bg-panel/60 p-3">{children}</div>
      <p className="text-sm leading-snug">{line}</p>
    </section>
  );
}

/** A plain text block (the goal, the points). */
export function TextBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 text-sm leading-snug">
      <h3 className="label text-neon">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The stage of a demo: a dark box of a fixed size (rem) the pictures are placed in (`position: absolute`).
 * Dark and solid so every demo reads the same, whatever the page behind is.
 */
export function Stage({
  w,
  h,
  children,
  testId,
  className = '',
}: {
  w: number;
  h: number;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`relative shrink-0 overflow-hidden rounded-md bg-[#101628] ${className}`}
      style={{ width: `${w}rem`, height: `${h}rem`, maxWidth: '100%' }}
    >
      {children}
    </div>
  );
}

/** A finger: the round touch marker that shows where a player taps. Move it with `x` / `y` (rem). */
export function Finger({
  x,
  y,
  down = false,
  hidden = false,
}: {
  x: number;
  y: number;
  down?: boolean;
  hidden?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-20 block rounded-full border-2 border-white/90 bg-white/25"
      style={{
        left: `${x - 0.55}rem`,
        top: `${y - 0.55}rem`,
        width: '1.1rem',
        height: '1.1rem',
        opacity: hidden ? 0 : 1,
        transform: down ? 'scale(0.78)' : 'scale(1)',
        transition:
          'left 0.55s ease-in-out, top 0.55s ease-in-out, transform 0.12s ease, opacity 0.2s ease',
      }}
    />
  );
}

/** A style for something that moves to (x, y) rem and eases there. */
export const slide = (
  x: number,
  y: number,
  ms = 500,
  extra: CSSProperties = {},
): CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  transform: `translate(${x}rem, ${y}rem)`,
  transition: `transform ${ms}ms ease-in-out, opacity 250ms ease`,
  ...extra,
});

/** A small label in a demo: navy with a coloured frame and text. */
export function Chip({
  children,
  colour,
  style,
}: {
  children: ReactNode;
  colour: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="absolute rounded-sm px-1.5 py-0.5 text-[0.65rem] font-black leading-none"
      style={{
        background: '#101628',
        color: colour,
        border: `2px solid ${colour}`,
        transition: 'opacity 0.25s',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
