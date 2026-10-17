import type { ReactNode } from 'react';

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
    <header className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-black leading-tight text-violet-600 dark:text-violet-400">
          {title}
        </h1>
        {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
      </div>
      <button
        onClick={onSettings}
        aria-label="Settings"
        data-testid="settings-button"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm dark:bg-slate-900"
      >
        ⚙️
      </button>
    </header>
  );
}
