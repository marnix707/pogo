import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { APP_NAME, AVATARS } from '@pogo/shared';
import type { AuthResponse } from '@pogo/shared';
import { createGuest, forgetSession, restoreSession } from './lib/session';
import { Playground } from './Playground';

function SignIn({ onDone }: { onDone: (session: AuthResponse) => void }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>(AVATARS[0]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onDone(await createGuest({ nickname, avatar }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-slate-600 dark:text-slate-300">Pick a nickname to play as a guest.</p>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nickname"
        maxLength={20}
        className="rounded-2xl border border-slate-300 bg-white px-4 py-4 text-lg dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <button
            type="button"
            key={a}
            onClick={() => setAvatar(a)}
            className={`rounded-2xl px-3 py-3 text-sm font-medium ${
              avatar === a
                ? 'bg-violet-600 text-white'
                : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      <button
        disabled={busy}
        className="rounded-2xl bg-violet-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        Let&apos;s play
      </button>
    </form>
  );
}

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    restoreSession()
      .then(setSession)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-5xl font-black tracking-tight text-violet-600 dark:text-violet-400">
        {APP_NAME}
      </h1>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-rose-600">{error}</p>
      ) : session ? (
        <Playground
          session={session}
          onSignOut={() => {
            forgetSession();
            setSession(null);
          }}
        />
      ) : (
        <SignIn onDone={setSession} />
      )}
    </main>
  );
}
