import { useState } from 'react';
import { readInstallDismissed, useInstall, writeInstallDismissed } from '../lib/install';
import { CloseIcon, LogoMark } from './icons';
import { Button, Sheet } from './ui';

/** How to add the app to the home screen on iPhone/iPad. */
function IosSteps() {
  const { iosThirdPartyBrowser } = useInstall();
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
        <b className="text-neon">3.</b> Tap <b>Add</b>. Open Po:go from your home screen: it runs
        fullscreen, without the browser bars.
      </li>
      <li className="rounded-md bg-panel2 p-3 text-muted">
        <b className="text-ink">Still opens with browser bars?</b> iPhone keeps the settings an icon
        had on the day you added it, so delete the old Po:go icon (hold it, Remove App) and add it
        again.{' '}
        {iosThirdPartyBrowser ? (
          <>
            You are in a browser other than Safari: open this page in <b>Safari</b> and add it from
            there, which is the most reliable way to get a fullscreen app.
          </>
        ) : (
          <>Adding it from Safari is the most reliable way to get a fullscreen app.</>
        )}
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
            <div className="font-semibold">Install Po:go</div>
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
          <div className="text-xs leading-snug text-muted">Add Po:go to your home screen</div>
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

/** Tells you whether this page is running as the installed fullscreen app or in a browser tab. */
export function DisplayModeNote() {
  const { standalone } = useInstall();
  return (
    <div
      data-testid="display-mode"
      data-standalone={standalone}
      className={`flex items-center gap-2 py-2 text-sm ${standalone ? 'text-neon' : 'text-muted'}`}
    >
      <span className={`h-2 w-2 rounded-full ${standalone ? 'bg-neon' : 'bg-muted/60'}`} />
      {standalone ? 'Running as an app (fullscreen)' : 'Running in a browser tab'}
    </div>
  );
}
