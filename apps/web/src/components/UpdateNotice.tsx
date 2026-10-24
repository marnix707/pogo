import { useEffect, useState } from 'react';
import { Button } from './ui';
import { useUpdateAvailable } from '../lib/updateCheck';

/** "Later" hides the notice for this long, then it asks again. */
const SNOOZE_MS = 5 * 60 * 1000;

/**
 * Shown over everything when a newer build of the app has been deployed while this page was open:
 * a dark backdrop and a box asking for a reload (a running page cannot swap its own code).
 */
export function UpdateNotice() {
  const outdated = useUpdateAvailable();
  const [snoozed, setSnoozed] = useState(false);
  useEffect(() => {
    if (!snoozed) return;
    const t = setTimeout(() => setSnoozed(false), SNOOZE_MS);
    return () => clearTimeout(t);
  }, [snoozed]);
  if (!outdated || snoozed) return null;
  return (
    <div
      className="menu fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
      data-testid="update-notice"
    >
      <div className="hud flex w-full max-w-sm flex-col gap-4 p-5 text-center">
        <h2 id="update-title" className="label text-lg text-ink">
          New version available
        </h2>
        <p className="text-sm leading-relaxed text-ink">
          You are using an older version of POGO. Please reload the app to get the latest update.
        </p>
        <Button
          className="min-h-14"
          onClick={() => window.location.reload()}
          data-testid="update-reload"
        >
          Reload now
        </Button>
        <button
          type="button"
          className="label text-[11px] text-muted underline"
          onClick={() => setSnoozed(true)}
          data-testid="update-later"
        >
          Later
        </button>
      </div>
    </div>
  );
}
