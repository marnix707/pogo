import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { avatarEmoji } from '../lib/avatars';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';
import { CloseIcon } from './icons';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accentink shadow-[0_4px_0_0_#b13d9c] active:translate-y-[2px] active:shadow-[0_2px_0_0_#b13d9c]',
  secondary:
    'border-2 border-neon bg-panel/60 text-neon shadow-[0_3px_0_0_rgb(31_224_224/0.35)] active:translate-y-[2px] active:shadow-[0_1px_0_0_rgb(31_224_224/0.35)]',
  danger:
    'bg-danger text-white shadow-[0_4px_0_0_#a8283f] active:translate-y-[2px] active:shadow-[0_2px_0_0_#a8283f]',
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
      className={`min-h-12 select-none rounded-md px-5 text-sm font-bold uppercase tracking-[0.14em] transition disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`hud p-4 ${className}`}>{children}</div>;
}

/** Section caption: tracked uppercase with a rule that runs to the edge. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <h2 className="label mb-3 flex items-center gap-3 text-onbg/80">
      {children}
      <span className="h-px flex-1 bg-onbg/25" />
      {right}
    </h2>
  );
}

/** Avatar as a dial: emoji inside a ring. */
export function Avatar({
  avatar,
  size = 'md',
  dim = false,
}: {
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
}) {
  const sizes = { sm: 'h-7 w-7 text-base', md: 'h-11 w-11 text-2xl', lg: 'h-16 w-16 text-4xl' };
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-neon bg-panel2 ${sizes[size]} ${dim ? 'opacity-50 grayscale' : ''}`}
    >
      {avatarEmoji(avatar)}
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="hud animate-slide-up w-full max-w-lg rounded-b-none !border-b-0 bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
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
        {children}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 text-left font-semibold"
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
