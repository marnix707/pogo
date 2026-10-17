import type { Connection } from '../lib/socket';

/** Shown whenever the realtime connection is not healthy. */
export function ConnectionBanner({ connection }: { connection: Connection }) {
  if (connection === 'online') return null;
  const offline = connection === 'offline';
  return (
    <div
      role="status"
      data-testid="connection-banner"
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-bold text-white ${
        offline ? 'bg-rose-600' : 'bg-amber-500'
      }`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      {offline ? 'Connection lost. Reconnecting…' : 'Connecting…'}
    </div>
  );
}
