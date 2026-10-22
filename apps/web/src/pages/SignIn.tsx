import { useState } from 'react';
import type { FormEvent } from 'react';
import { AVATARS } from '@pogo/shared';
import type { AuthResponse } from '@pogo/shared';
import { Wordmark } from '../components/PogoStage';
import frogOnStick from '../assets/sprites/brand/frog-pogo.svg';
import { Button } from '../components/ui';
import { AvatarFace } from '../components/AvatarFace';
import { forgetPlayer, readPlayers } from '../lib/players';
import type { SavedPlayer } from '../lib/players';
import {
  adoptToken,
  createGuest,
  login,
  restoreSession,
  startReset,
  verifyReset,
} from '../lib/session';
import { PlayerName } from '../components/PlayerName';

export function SignIn({ onDone }: { onDone: (session: AuthResponse) => void }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>(AVATARS[0]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'guest' | 'login' | 'reset' | 'reset-code'>('guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  /** Guests this device has played as: one tap continues as them ("Switch player" never loses one). */
  const [saved, setSaved] = useState<SavedPlayer[]>(() => readPlayers());
  const [forgetting, setForgetting] = useState<string | null>(null);

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

  async function continueAs(player: SavedPlayer) {
    setBusy(true);
    setError(undefined);
    try {
      adoptToken(player.token);
      const session = await restoreSession();
      if (session) {
        onDone(session);
        return;
      }
      // The server no longer knows this guest (or its login expired): drop it.
      forgetPlayer(player.id);
      setSaved(readPlayers());
      setError(`${player.nickname} could not be restored.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function account(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'login') onDone((await login(email, password)).auth);
      else if (mode === 'reset') {
        await startReset(email);
        setNote('If that email has an account, a code is on its way.');
        setMode('reset-code');
      } else {
        await verifyReset(email, code, password);
        setNote('Password changed. Log in with the new one.');
        setPassword('');
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'min-h-14 rounded-md border-2 border-edge/40 bg-panel2 px-4 text-lg font-semibold text-ink placeholder:text-muted/50 outline-none focus:border-neon';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col items-center text-center" data-testid="signin-brand">
        {/* The same wordmark and frog as the home screen (the artist's pixel art). */}
        <Wordmark shown width={270} />
        <img
          src={frogOnStick}
          alt=""
          aria-hidden
          data-testid="signin-frog"
          className="mt-1"
          style={{ width: 24 * 5, imageRendering: 'pixelated' }}
        />
        <p className="label mt-4 text-onbg/80">Quick games · No account needed</p>
      </div>

      {mode !== 'guest' && (
        <form onSubmit={account} className="hud hud-ticks flex flex-col gap-4 p-5">
          {note && <p className="text-sm text-muted">{note}</p>}
          <input
            data-testid="login-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          {mode === 'reset-code' && (
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              aria-label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={field}
            />
          )}
          {mode !== 'reset' && (
            <input
              data-testid="login-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="go"
              placeholder={mode === 'login' ? 'Password' : 'New password (8+ characters)'}
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-danger/20 px-4 py-2 font-medium text-dangertext"
            >
              {error}
            </p>
          )}
          <Button data-testid="login-submit" disabled={busy || !email}>
            {mode === 'login' ? 'Log in' : mode === 'reset' ? 'Send code' : 'Change password'}
          </Button>
          {mode === 'login' && (
            <button
              type="button"
              className="label text-muted underline"
              onClick={() => setMode('reset')}
            >
              Forgot password?
            </button>
          )}
          <button
            type="button"
            className="label text-muted underline"
            onClick={() => {
              setMode('guest');
              setError(undefined);
              setNote('');
            }}
          >
            Back
          </button>
        </form>
      )}
      {mode === 'guest' && saved.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="saved-players">
          <p className="label text-center text-onbg/80">Players on this device</p>
          {saved.map((p) =>
            forgetting === p.id ? (
              <div
                key={p.id}
                className="hud flex flex-col gap-2 p-3"
                data-testid={`forget-${p.id}`}
              >
                <p
                  className={`text-sm ${p.recoverySaved ? '' : 'font-semibold text-dangertext'}`}
                  data-severity={p.recoverySaved ? 'soft' : 'strong'}
                >
                  {p.recoverySaved
                    ? `Remove ${p.nickname} from this device? You saved a recovery link, so you can still get it back with that link.`
                    : `Forget ${p.nickname}? Its stats are lost for good: nothing else can bring this player back.`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={p.recoverySaved ? 'secondary' : 'danger'}
                    className="flex-1"
                    data-testid="forget-confirm"
                    onClick={() => {
                      forgetPlayer(p.id);
                      setSaved(readPlayers());
                      setForgetting(null);
                    }}
                  >
                    Forget
                  </Button>
                  <Button className="flex-1" onClick={() => setForgetting(null)}>
                    Keep
                  </Button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  disabled={busy}
                  data-testid={`continue-as-${p.id}`}
                  onClick={() => void continueAs(p)}
                  className="hud flex min-w-0 flex-1 items-center gap-3 p-2.5 text-left disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center text-3xl">
                    <AvatarFace avatar={p.avatar} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    Continue as <PlayerName name={p.nickname} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Forget ${p.nickname}`}
                  data-testid={`forget-player-${p.id}`}
                  onClick={() => setForgetting(p.id)}
                  className="hud w-11 shrink-0 text-lg font-bold"
                >
                  ×
                </button>
              </div>
            ),
          )}
        </section>
      )}
      {mode === 'guest' && (
        <>
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
                autoCorrect="off"
                enterKeyHint="go"
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
                      avatar === a
                        ? 'scale-110 border-accent bg-accent/25'
                        : 'border-edge/40 bg-panel2'
                    }`}
                  >
                    <AvatarFace avatar={a} />
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-danger/20 px-4 py-2 font-medium text-dangertext"
              >
                {error}
              </p>
            )}
            <Button data-testid="signin-submit" disabled={busy || nickname.trim().length < 2}>
              Let&apos;s play
            </Button>
          </form>
          <button
            type="button"
            data-testid="signin-login"
            className="label text-center text-onbg/80 underline"
            onClick={() => setMode('login')}
          >
            Have an account? Log in
          </button>
        </>
      )}
    </main>
  );
}
