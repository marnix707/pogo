import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AVATARS } from '@pogo/shared';
import type { AuthResponse, PublicUser } from '@pogo/shared';
import {
  deleteAccount,
  login,
  mergeGuest,
  removeAvatar,
  resizeImage,
  startRegister,
  startReset,
  uploadAvatar,
  verifyRegister,
  verifyReset,
} from '../lib/session';
import { AvatarFace } from './AvatarFace';
import { Button, Sheet } from './ui';

export type ProfileMode = 'main' | 'register' | 'login';
type Step =
  | 'main'
  | 'register-email'
  | 'register-code'
  | 'login'
  | 'reset-email'
  | 'reset-code'
  | 'merge'
  | 'delete';

type Avatar = (typeof AVATARS)[number];

const input =
  'hud min-h-12 w-full min-w-0 bg-panel px-3 text-lg font-bold text-ink outline-none placeholder:text-muted/40 focus:!border-neon';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label text-muted">{label}</span>
      {children}
    </label>
  );
}

export function ProfileSheet({
  open,
  onClose,
  user,
  token,
  initial = 'main',
  onProfile,
  onUser,
  onSession,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  token: string;
  /** Open straight on the register or login form (e.g. from the end-of-game card). */
  initial?: ProfileMode;
  onProfile: (profile: { nickname: string; avatar: Avatar }) => Promise<void>;
  onUser: (user: PublicUser) => void;
  /** Logged in as someone else: switch the app to this session. */
  onSession: (auth: AuthResponse) => void;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState<Step>('main');
  const [name, setName] = useState(user.nickname);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<{ auth: AuthResponse; token: string; games: number } | null>(
    null,
  );
  const file = useRef<HTMLInputElement>(null);

  // Every time the sheet opens it starts fresh (on the requested form).
  useEffect(() => {
    if (!open) return;
    setStep(initial === 'register' ? 'register-email' : initial === 'login' ? 'login' : 'main');
    setName(user.nickname);
    setCode('');
    setPassword('');
    setError('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (next: Step) => {
    setStep(next);
    setError('');
    setCode('');
    setPassword('');
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (fn: () => Promise<void>) => (e: FormEvent) => {
    e.preventDefault();
    void run(fn);
  };

  const saveName = submit(async () => {
    const nickname = name.trim();
    if (nickname && nickname !== user.nickname) {
      await onProfile({ nickname, avatar: user.avatar as Avatar });
    }
    onClose();
  });

  const picture = (f: File | undefined) =>
    f &&
    run(async () => {
      onUser(await uploadAvatar(token, await resizeImage(f)));
    });

  const titles: Record<Step, string> = {
    main: 'Your profile',
    'register-email': 'Save your progress',
    'register-code': 'Check your email',
    login: 'Log in',
    'reset-email': 'Reset password',
    'reset-code': 'Choose a new password',
    merge: 'Keep your games?',
    delete: 'Delete account',
  };

  return (
    <Sheet open={open} onClose={onClose} title={titles[step]}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger/20 px-3 py-2 text-sm font-medium text-dangertext"
        >
          {error}
        </p>
      )}
      {note && <p className="mb-3 text-sm text-muted">{note}</p>}

      {step === 'main' && (
        <div className="flex flex-col gap-4">
          <form className="flex gap-2" onSubmit={saveName}>
            <input
              data-testid="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              aria-label="Nickname"
              className={input}
            />
            <Button data-testid="profile-save" disabled={busy} className="!px-4">
              Save
            </Button>
          </form>

          {!user.isGuest && (
            <div className="flex items-center gap-3">
              <span className="hud flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden text-4xl">
                <AvatarFace avatar={user.avatar} fill />
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  data-testid="profile-picture-input"
                  onChange={(e) => {
                    void picture(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  data-testid="profile-picture"
                  className="!min-h-10"
                  onClick={() => file.current?.click()}
                >
                  Upload picture
                </Button>
                {user.avatar.startsWith('img:') && (
                  <button
                    type="button"
                    className="label text-left text-muted underline"
                    onClick={() => void run(async () => onUser(await removeAvatar(token)))}
                  >
                    Remove picture
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                data-testid={`pick-avatar-${a}`}
                aria-label={a}
                aria-pressed={user.avatar === a}
                onClick={() => {
                  onClose();
                  if (a !== user.avatar) void onProfile({ nickname: user.nickname, avatar: a });
                }}
                className={`flex aspect-square items-center justify-center rounded-[8px] border-2 text-2xl ring-2 ring-line transition active:translate-y-px ${
                  user.avatar === a ? 'border-neon bg-neon/20' : 'border-edge/40 bg-panel2'
                }`}
              >
                <AvatarFace avatar={a} />
              </button>
            ))}
          </div>

          {user.isGuest ? (
            <div className="hud flex flex-col gap-2 p-3" data-testid="account-card">
              <p className="text-sm">
                <b>Keep track of your scores.</b> Register with your email to save your wins and
                high scores, upload your own picture and play on any device.
              </p>
              <Button data-testid="account-register" onClick={() => go('register-email')}>
                Register
              </Button>
              <button
                type="button"
                data-testid="account-login"
                className="label text-center text-muted underline"
                onClick={() => go('login')}
              >
                I already have an account
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted" data-testid="account-email">
                Signed in as <b className="text-ink">{user.email}</b>
              </p>
              <Button variant="secondary" data-testid="account-logout" onClick={onSignOut}>
                Log out
              </Button>
              <button
                type="button"
                className="label text-center text-muted underline"
                onClick={() => go('delete')}
              >
                Delete my account
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'register-email' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            await startRegister(token, email);
            setNote(`We sent a 6-digit code to ${email}.`);
            go('register-code');
          })}
        >
          <p className="text-sm text-muted">
            Everything you have played so far is kept. We send a code to confirm your email.
          </p>
          <Field label="Email">
            <input
              data-testid="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </Field>
          <Button data-testid="register-send" disabled={busy || !email.includes('@')}>
            Send code
          </Button>
          <Back onClick={() => go('main')} />
        </form>
      )}

      {step === 'register-code' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            onUser(await verifyRegister(token, email, code, password));
            setNote('You are registered. Your games are saved to your account.');
            go('main');
          })}
        >
          <Field label="6-digit code">
            <input
              data-testid="register-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${input} text-center tracking-[0.4em]`}
            />
          </Field>
          <Field label="Choose a password (8+ characters)">
            <input
              data-testid="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </Field>
          <Button
            data-testid="register-submit"
            disabled={busy || code.length !== 6 || password.length < 8}
          >
            Create account
          </Button>
          <Back onClick={() => go('register-email')} />
        </form>
      )}

      {step === 'login' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            const { auth, guest } = await login(email, password);
            if (guest) {
              setOffer({ auth, token: guest.token, games: guest.games });
              setStep('merge');
              return;
            }
            onSession(auth);
            onClose();
          })}
        >
          <Field label="Email">
            <input
              data-testid="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </Field>
          <Field label="Password">
            <input
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </Field>
          <Button data-testid="login-submit" disabled={busy || !email || !password}>
            Log in
          </Button>
          <button
            type="button"
            className="label text-center text-muted underline"
            onClick={() => go('reset-email')}
          >
            Forgot password?
          </button>
          <Back onClick={() => go('main')} />
        </form>
      )}

      {step === 'reset-email' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            await startReset(email);
            setNote('If that email has an account, a code is on its way.');
            go('reset-code');
          })}
        >
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </Field>
          <Button disabled={busy || !email.includes('@')}>Send code</Button>
          <Back onClick={() => go('login')} />
        </form>
      )}

      {step === 'reset-code' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            await verifyReset(email, code, password);
            setNote('Password changed. Log in with the new one.');
            go('login');
          })}
        >
          <Field label="6-digit code">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${input} text-center tracking-[0.4em]`}
            />
          </Field>
          <Field label="New password (8+ characters)">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </Field>
          <Button disabled={busy || code.length !== 6 || password.length < 8}>
            Change password
          </Button>
          <Back onClick={() => go('login')} />
        </form>
      )}

      {step === 'merge' && offer && (
        <div className="flex flex-col gap-3" data-testid="merge-offer">
          <p className="text-sm">
            This device has {offer.games} game{offer.games === 1 ? '' : 's'} played as a guest. Add{' '}
            {offer.games === 1 ? 'it' : 'them'} to your account?
          </p>
          <Button
            data-testid="merge-yes"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await mergeGuest(offer.auth.token, offer.token).catch(() => undefined);
                onSession(offer.auth);
                onClose();
              })
            }
          >
            Add them
          </Button>
          <Button
            variant="secondary"
            data-testid="merge-no"
            onClick={() => {
              onSession(offer.auth);
              onClose();
            }}
          >
            Skip
          </Button>
        </div>
      )}

      {step === 'delete' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={submit(async () => {
            await deleteAccount(token, password);
            onSignOut();
          })}
        >
          <p className="text-sm text-muted">
            This deletes your account, picture and all saved scores for good.
          </p>
          <Field label="Your password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </Field>
          <Button variant="danger" disabled={busy || !password}>
            Delete everything
          </Button>
          <Back onClick={() => go('main')} />
        </form>
      )}
    </Sheet>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="label text-center text-muted underline" onClick={onClick}>
      Back
    </button>
  );
}
