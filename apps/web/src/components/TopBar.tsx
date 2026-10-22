import type { ReactNode } from 'react';
import { RaisedColon } from './Brand';
import { SlidersIcon } from './icons';

export function TileButton({
  children,
  small = false,
  className = '',
  ...props
}: { children: ReactNode; small?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`hud flex shrink-0 items-center justify-center !rounded-md text-neon active:translate-y-px ${
        small ? 'h-10 w-10' : 'h-11 w-11'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function TopBar({
  title,
  subtitle,
  left,
  actions,
  onSettings,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  /** Extra buttons shown before the settings button. */
  actions?: ReactNode;
  onSettings: () => void;
  /** One-line header that leaves more room for the screen below (used in games). */
  compact?: boolean;
}) {
  return (
    <header
      className={`flex items-center gap-3 px-4 ${
        compact
          ? 'pb-1.5 pt-[calc(env(safe-area-inset-top)+0.5rem)]'
          : 'pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)]'
      }`}
    >
      {left}
      <div className={`min-w-0 flex-1 ${compact ? 'flex items-baseline gap-3' : ''}`}>
        <h1
          className={`truncate font-bold uppercase leading-tight tracking-[0.12em] text-onbg ${
            compact ? 'text-lg' : 'text-xl'
          }`}
        >
          <RaisedColon text={title} />
        </h1>
        {subtitle && <div className="label truncate text-[10px] text-onbg/70">{subtitle}</div>}
      </div>
      {actions}
      <TileButton
        small={compact}
        onClick={onSettings}
        aria-label="Settings"
        data-testid="settings-button"
      >
        <SlidersIcon className="h-5 w-5" />
      </TileButton>
    </header>
  );
}
