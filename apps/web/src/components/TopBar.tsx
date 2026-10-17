import type { ReactNode } from 'react';
import { SlidersIcon } from './icons';

export function TileButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="hud flex h-11 w-11 shrink-0 items-center justify-center !rounded-md text-neon active:translate-y-px"
    >
      {children}
    </button>
  );
}

export function TopBar({
  title,
  subtitle,
  left,
  onSettings,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  onSettings: () => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold uppercase leading-tight tracking-[0.12em] text-onbg">
          {title}
        </h1>
        {subtitle && <div className="label truncate text-[10px] text-onbg/70">{subtitle}</div>}
      </div>
      <TileButton onClick={onSettings} aria-label="Settings" data-testid="settings-button">
        <SlidersIcon className="h-5 w-5" />
      </TileButton>
    </header>
  );
}
