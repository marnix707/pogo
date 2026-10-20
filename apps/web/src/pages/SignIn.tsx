import { useState } from 'react';
import type { FormEvent } from 'react';
import { AVATARS } from '@pogo/shared';
import type { AuthResponse } from '@pogo/shared';
import { RaisedColon } from '../components/Brand';
import { LogoMark } from '../components/icons';
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <div className="text-center">
        <LogoMark className="mx-auto mb-4 h-24 w-24 drop-shadow-[0_6px_0_rgb(0_24_80/0.35)]" />
        <h1 className="text-6xl font-bold uppercase tracking-[0.18em] text-onbg [text-shadow:4px_4px_0_rgb(var(--c-accent))]">
          <RaisedColon text="Po:go" />
        </h1>
        <p className="label mt-4 text-onbg/80">Quick games · No account needed</p>
      </div>

      <form onSubmit={submit} className="hud hud-ticks flex flex-col gap-5 p-5">
        <label className="flex flex-col gap-2">
          <span className="label text-muted">Your nickname</span>
          <input
            data-testid="signin-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Dice Queen"
            maxLength={20}
            autoComplete="nickname"
            className="min-h-14 rounded-md border-2 border-edge/40 bg-panel2 px-4 text-lg font-semibold text-ink placeholder:text-muted/50 outline-none focus:border-neon"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-2 text-muted">Pick an avatar</legend>
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                aria-label={a}
                aria-pressed={avatar === a}
                onClick={() => setAvatar(a)}
                className={`flex aspect-square items-center justify-center rounded-[6px] border-2 text-2xl transition ${
                  avatar === a ? 'scale-110 border-accent bg-accent/25' : 'border-edge/40 bg-panel2'
                }`}
              >
                {avatarEmoji(a)}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-md bg-danger/20 px-4 py-2 font-medium text-dangertext">
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
