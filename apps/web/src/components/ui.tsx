import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { avatarEmoji } from '../lib/avatars';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-violet-600 text-white shadow-[0_4px_0_0_#5b21b6] active:translate-y-[2px] active:shadow-[0_2px_0_0_#5b21b6]',
  secondary:
    'bg-white text-slate-800 shadow-[0_3px_0_0_#cbd5e1] active:translate-y-[2px] active:shadow-[0_1px_0_0_#cbd5e1] dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_3px_0_0_#020617]',
  danger:
    'bg-rose-600 text-white shadow-[0_4px_0_0_#9f1239] active:translate-y-[2px] active:shadow-[0_2px_0_0_#9f1239]',
  ghost: 'bg-transparent text-slate-600 dark:text-slate-300',
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
      className={`min-h-12 select-none rounded-2xl px-5 text-base font-bold transition disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function Avatar({
  avatar,
  size = 'md',
  dim = false,
}: {
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
}) {
  const sizes = { sm: 'h-7 w-7 text-base', md: 'h-10 w-10 text-2xl', lg: 'h-14 w-14 text-4xl' };
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950 ${sizes[size]} ${dim ? 'opacity-50 grayscale' : ''}`}
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between text-left text-base font-semibold"
    >
      {label}
      <span
        className={`relative h-8 w-14 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`}
        />
      </span>
    </button>
  );
}
