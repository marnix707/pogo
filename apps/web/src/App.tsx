import { useEffect, useState } from 'react';
import type { AuthResponse } from '@pogo/shared';
import { ToastProvider } from './components/Toast';
import { TopoBackground } from './components/TopoBackground';
import { unlockAudio } from './lib/sound';
import { consumeRecoveryLink, forgetSession, restoreSession } from './lib/session';
import { Shell } from './Shell';
import { SignIn } from './pages/SignIn';

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    // A recovery link (?recover=<token>) logs this device in as that player.
    consumeRecoveryLink();
    restoreSession()
      .then(setSession)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Browsers only start audio after a gesture. Never on a tap in a text field: starting audio while
    // the keyboard is opening can make iOS drop the keyboard, so the unlock waits for the next tap.
    const unlock = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]'))
        return;
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <ToastProvider>
      <TopoBackground />
      {loading ? (
        <p className="label p-8 text-center text-onbg">Loading…</p>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="mb-4 font-semibold text-dangertext">{error}</p>
          <button className="underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : session ? (
        <Shell
          session={session}
          onUser={(user) => setSession((s) => (s ? { ...s, user } : s))}
          onSession={setSession}
          onSignOut={() => {
            forgetSession();
            // A fresh page (not an in-place swap): the focused button and the sheets are gone, so the
            // sign-in fields start with a clean focus state (iPhone home-screen apps did not show the
            // keyboard after an in-place switch). Saved guests survive in localStorage.
            (document.activeElement as HTMLElement | null)?.blur();
            window.location.reload();
          }}
        />
      ) : (
        <SignIn onDone={setSession} />
      )}
    </ToastProvider>
  );
}
