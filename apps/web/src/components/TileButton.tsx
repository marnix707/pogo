import type { ReactNode } from 'react';

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
