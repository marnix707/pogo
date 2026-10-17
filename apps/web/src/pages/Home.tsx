import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicUser } from '@pogo/shared';
import { Avatar, Button, Card } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { gameUis } from '../games/registry';
import type { RoomApi } from '../lib/api';

export function Home({
  user,
  api,
  onSettings,
}: {
  user: PublicUser;
  api: RoomApi;
  onSettings: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<unknown>) {
    setBusy(true);
    await p;
    setBusy(false);
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) void run(api.join(code));
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar title="Pogo" onSettings={onSettings} />
      <main className="flex flex-1 flex-col gap-5 px-4 pb-8 pt-2">
        <div className="flex items-center gap-3">
          <Avatar avatar={user.avatar} size="lg" />
          <div>
            <div className="text-sm text-slate-500">Welcome back</div>
            <div className="text-2xl font-black" data-testid="home-nickname">
              {user.nickname}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-3" aria-label="Games">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Play</h2>
          {gameUis.map((g) => (
            <Card key={g.id} className="flex items-center gap-4">
              <span className="text-5xl" aria-hidden>
                {g.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-black">{g.name}</div>
                <div className="text-sm text-slate-500">{g.tagline}</div>
              </div>
              <Button
                data-testid={`home-new-${g.id}`}
                disabled={busy || !api.online}
                onClick={() => void run(api.create(g.id))}
              >
                New game
              </Button>
            </Card>
          ))}
        </section>

        <section aria-label="Join a game">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">
            Join with a code
          </h2>
          <form onSubmit={join} className="flex gap-3">
            <input
              data-testid="home-join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABCDE"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Room code"
              className="min-h-14 min-w-0 flex-1 rounded-2xl border-2 border-transparent bg-white px-4 text-center text-2xl font-black uppercase tracking-[0.3em] shadow-sm outline-none focus:border-violet-500 dark:bg-slate-900"
            />
            <Button
              data-testid="home-join-submit"
              disabled={busy || !api.online || code.length < 4}
              className="px-6"
            >
              Join
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
