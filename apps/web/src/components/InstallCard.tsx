import { useState } from 'react';
import { readInstallDismissed, useInstall, writeInstallDismissed } from '../lib/install';
import { CloseIcon, LogoMark } from './icons';
import { Button, Sheet } from './ui';

/** How to add the app to the home screen on iPhone/iPad (Safari and Chrome both use the Share menu). */
function IosSteps() {
  return (
    <ol className="flex flex-col gap-3 text-sm leading-relaxed" data-testid="install-steps">
      <li>
        <b className="text-neon">1.</b> Tap the <b>Share</b> button, the square with an arrow
        pointing up (in Safari it is at the bottom, in Chrome at the top right).
      </li>
      <li>
        <b className="text-neon">2.</b> Scroll down and tap <b>Add to Home Screen</b>.
      </li>
      <li>
        <b className="text-neon">3.</b> Tap <b>Add</b>. Open Pogo from your home screen: it runs
        fullscreen, without the browser bars.
      </li>
    </ol>
  );
}

/**
 * "Install the app" prompt. `banner` sits on the home screen and can be dismissed for good;
 * `settings` lives in the settings sheet. Renders nothing when already installed, or when there is
 * no way to install (desktop Firefox, an in-app browser, ...).
 */
export function InstallCard({ variant }: { variant: 'banner' | 'settings' }) {
  const { standalone, ios, canPrompt, prompt } = useInstall();
  const [dismissed, setDismissed] = useState(readInstallDismissed);
  const [stepsOpen, setStepsOpen] = useState(false);

  if (standalone || (!canPrompt && !ios)) return null;
  if (variant === 'banner' && dismissed) return null;

  const action = canPrompt ? (
    <Button data-testid="install-prompt" className="min-h-10 !px-4" onClick={() => void prompt()}>
      Install
    </Button>
  ) : (
    <Button
      data-testid="install-how"
      variant="secondary"
      className="min-h-10 !px-4"
      onClick={() => setStepsOpen((open) => !open)}
    >
      How
    </Button>
  );

  if (variant === 'settings') {
    return (
      <div className="flex flex-col gap-2 py-2" data-testid="install-settings">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Install Pogo</div>
            <div className="text-sm text-muted">Add it to your home screen to play fullscreen</div>
          </div>
          {action}
        </div>
        {ios && stepsOpen && <IosSteps />}
      </div>
    );
  }

  return (
    <>
      <div className="hud flex items-center gap-3 p-3" data-testid="install-banner">
        <LogoMark className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-tight">Play fullscreen</div>
          <div className="text-xs leading-snug text-muted">Add Pogo to your home screen</div>
        </div>
        {action}
        <button
          aria-label="Dismiss"
          data-testid="install-dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted"
          onClick={() => {
            writeInstallDismissed();
            setDismissed(true);
          }}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {ios && (
        <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Add to Home Screen">
          <IosSteps />
        </Sheet>
      )}
    </>
  );
}
