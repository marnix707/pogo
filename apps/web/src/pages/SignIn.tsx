import { useState } from 'react';
import type { FormEvent } from 'react';
import { AVATARS } from '@pogo/shared';
import type { AuthResponse } from '@pogo/shared';
import { Button } from '../components/ui';
import { avatarEmoji } from '../lib/avatars';
import { createGuest } from '../lib/session';

export function SignIn({ onDone }: { onDone: (session: AuthResponse) => void }) {
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <div className="text-6xl" aria-hidden>
          🎲
        </div>
        <h1 className="text-6xl font-black tracking-tight text-violet-600 dark:text-violet-400">
          Pogo
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Quick games with friends. No account needed.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 font-semibold">
          Your nickname
          <input
            data-testid="signin-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Dice Queen"
            maxLength={20}
            autoComplete="nickname"
            className="min-h-14 rounded-2xl border-2 border-transparent bg-white px-4 text-lg font-normal shadow-sm outline-none focus:border-violet-500 dark:bg-slate-900"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Pick an avatar</legend>
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                aria-label={a}
                aria-pressed={avatar === a}
                onClick={() => setAvatar(a)}
                className={`flex aspect-square items-center justify-center rounded-2xl text-3xl transition ${
                  avatar === a
                    ? 'scale-110 bg-violet-600 shadow-md'
                    : 'bg-white shadow-sm dark:bg-slate-900'
                }`}
              >
                {avatarEmoji(a)}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-100 px-4 py-2 font-medium text-rose-700">
            {error}
          </p>
        )}
        <Button data-testid="signin-submit" disabled={busy || nickname.trim().length < 2}>
          Let&apos;s play
        </Button>
      </form>
    </main>
  );
}
