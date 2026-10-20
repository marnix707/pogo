import { useEffect, useState } from 'react';
import type { AuthResponse } from '@pogo/shared';
import { ToastProvider } from './components/Toast';
import { TopoBackground } from './components/TopoBackground';
import { unlockAudio } from './lib/sound';
import { forgetSession, restoreSession } from './lib/session';
import { Shell } from './Shell';
import { SignIn } from './pages/SignIn';

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    restoreSession()
      .then(setSession)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Browsers only start audio after a gesture.
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
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
          onSignOut={() => {
            forgetSession();
            setSession(null);
          }}
        />
      ) : (
        <SignIn onDone={setSession} />
      )}
    </ToastProvider>
  );
}
