import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AvatarFace } from './AvatarFace';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';
import { CloseIcon } from './icons';

type Variant = 'primary' | 'secondary' | 'danger' | 'gold' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accentink ring-2 ring-line shadow-[0_5px_0_0_#0081d3,0_5px_0_2px_rgb(var(--c-line))] active:translate-y-[3px] active:shadow-[0_2px_0_0_#0081d3,0_2px_0_2px_rgb(var(--c-line))]',
  secondary:
    'border-2 border-neon/70 bg-panel2 text-neon ring-2 ring-line shadow-[0_5px_0_0_rgb(var(--c-line))] active:translate-y-[3px] active:shadow-[0_2px_0_0_rgb(var(--c-line))]',
  danger:
    'bg-danger text-white ring-2 ring-line shadow-[0_5px_0_0_#8c2b26,0_5px_0_2px_rgb(var(--c-line))] active:translate-y-[3px] active:shadow-[0_2px_0_0_#8c2b26,0_2px_0_2px_rgb(var(--c-line))]',
  // Gold-orange fill (the highlight colour) with dark text: the Home "Play" button.
  gold: 'bg-neon text-accentink ring-2 ring-line shadow-[0_5px_0_0_#b36f00,0_5px_0_2px_rgb(var(--c-line))] active:translate-y-[3px] active:shadow-[0_2px_0_0_#b36f00,0_2px_0_2px_rgb(var(--c-line))]',
  ghost: 'bg-transparent text-onbg/80',
};

export function Button({
  variant = 'primary',
  className = '',
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        haptic('tap');
        play('tap');
        onClick?.(e);
      }}
      className={`min-h-12 select-none rounded-[8px] px-5 text-sm font-bold uppercase tracking-[0.1em] transition disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`hud p-4 ${className}`}>{children}</div>;
}

/** Section caption: tracked uppercase with a rule that runs to the edge. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <h2 className="label mb-3 flex items-center gap-3 text-onbg [text-shadow:0_2px_0_rgb(var(--c-line))]">
      {children}
      <span className="h-[3px] flex-1 rounded-full bg-line/70" />
      {right}
    </h2>
  );
}

/** Avatar as a square tile: emoji on a slate plate with a dark outline. */
export function Avatar({
  avatar,
  size = 'md',
  dim = false,
  className = '',
}: {
  avatar: string;
  size?: 'sm' | 'chat' | 'md' | 'lg' | 'fluid';
  dim?: boolean;
  /** With `size="fluid"`: the sizing classes (for screens that scale with their own width). */
  className?: string;
}) {
  const sizes = {
    sm: 'h-7 w-7 text-base',
    // As high as a one-line chat message: the name line (1.25rem) + gap + the bubble (2rem).
    chat: 'h-[3.375rem] w-[3.375rem] text-3xl',
    md: 'h-11 w-11 text-2xl',
    lg: 'h-16 w-16 text-4xl',
    fluid: className,
  };
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-2 border-neon bg-panel2 ring-2 ring-line ${sizes[size]} ${dim ? 'opacity-50 grayscale' : ''}`}
    >
      <AvatarFace avatar={avatar} fill />
    </span>
  );
}

/** How long the sheet takes to slide away (matches `sheet-down` in index.css). */
const SHEET_MS = 220;

/**
 * A panel that slides up from the bottom over a dimmed page; tapping outside (or the X) slides it
 * back down and the page returns to normal brightness. It stays mounted while it slides away.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
  from = 'bottom',
  dim = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Almost the whole screen high (a list that needs the room); the content then fills the sheet. */
  full?: boolean;
  /** Slide in from the top instead of the bottom (the settings). */
  from?: 'bottom' | 'top';
  /** Dim the page behind it (an undimmed sheet still closes on a tap outside it). */
  dim?: boolean;
}) {
  const top = from === 'top';
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, SHEET_MS);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div
      className={`sheet-backdrop fixed inset-0 z-40 flex justify-center ${top ? 'items-start' : 'items-end'} ${
        dim ? 'bg-black/60' : ''
      } ${closing ? 'pointer-events-none' : ''}`}
      data-closing={closing}
      data-testid="sheet-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        data-closing={closing}
        onClick={(e) => e.stopPropagation()}
        className={`hud menu w-full max-w-lg bg-panel px-5 shadow-xl ${
          top
            ? 'sheet-panel-top rounded-t-none !border-t-0 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]'
            : 'sheet-panel rounded-b-none !border-b-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5'
        } ${full ? 'flex h-[94dvh] flex-col overflow-hidden' : 'max-h-[92dvh] overflow-y-auto'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold uppercase tracking-[0.16em]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-edge/50 text-neon"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {full ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Shown but greyed out and not tappable (e.g. a setting only the host can change). */
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 text-left font-semibold disabled:opacity-50"
    >
      <span>
        {label}
        {hint && <span className="block text-sm font-normal text-muted">{hint}</span>}
      </span>
      <span
        className={`relative h-8 w-14 rounded-md border-2 transition ${
          checked ? 'border-neon bg-neon/25' : 'border-edge/40 bg-panel2'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-[4px] transition-all ${
            checked ? 'left-[1.625rem] bg-neon' : 'left-0.5 bg-muted/60'
          }`}
        />
      </span>
    </button>
  );
}

function Drain({
  remainingMs,
  totalMs,
  urgent,
  vertical,
}: {
  remainingMs: number;
  totalMs: number;
  urgent: boolean;
  vertical: boolean;
}) {
  // Computed once per deadline (the parent keys this component by it), so re-renders never
  // restart or bend the running animation.
  const [start] = useState(() => ({
    from: Math.min(1, Math.max(0, totalMs > 0 ? remainingMs / totalMs : 1)),
    ms: Math.max(0, remainingMs),
  }));
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${urgent ? 'timer-flash' : ''}`}
    >
      <span
        className={`${vertical ? 'timer-drain-v' : 'timer-drain'} absolute inset-0 ${urgent ? 'bg-danger/55' : 'bg-white/25'}`}
        style={
          {
            '--from': start.from,
            animationDuration: `${start.ms}ms`,
          } as React.CSSProperties
        }
      />
    </span>
  );
}

/**
 * A reverse loading bar: a tinted overlay that shrinks away until the turn deadline. Put it inside
 * a `relative overflow-hidden` element (a button or a box); it sits under the element's text only
 * if the text has `relative` too. Renders nothing without a deadline.
 */
export function TimerDrain({
  deadline,
  serverTime,
  totalSec,
  urgent = false,
  active = true,
  vertical = false,
}: {
  deadline: number | null | undefined;
  serverTime: number;
  totalSec: number;
  urgent?: boolean;
  /** Only drain while true (e.g. on my turn). */
  active?: boolean;
  /** Drain downwards (the level drops) instead of from the right to the left. */
  vertical?: boolean;
}) {
  if (deadline == null || !active) return null;
  const remainingMs = deadline - serverTime;
  return (
    <Drain
      key={deadline}
      remainingMs={remainingMs}
      totalMs={totalSec * 1000}
      urgent={urgent}
      vertical={vertical}
    />
  );
}
