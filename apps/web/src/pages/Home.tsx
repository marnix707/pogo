import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicUser } from '@pogo/shared';
import { Avatar, Button, Card, SectionLabel } from '../components/ui';
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
      <TopBar title="Pogo" subtitle="Game hub" onSettings={onSettings} />
      <main className="flex flex-1 flex-col gap-6 px-4 pb-8 pt-2">
        <div className="hud flex items-center gap-4 p-3">
          <Avatar avatar={user.avatar} size="lg" />
          <div className="min-w-0">
            <div className="label text-muted">Pilot</div>
            <div className="truncate text-2xl font-bold" data-testid="home-nickname">
              {user.nickname}
            </div>
          </div>
        </div>

        <section aria-label="Games">
          <SectionLabel>Play</SectionLabel>
          <div className="flex flex-col gap-3">
            {gameUis.map((g) => (
              <Card key={g.id} className="hud-ticks flex items-center gap-4">
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-accent text-4xl"
                  aria-hidden
                >
                  {g.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold uppercase tracking-[0.12em]">{g.name}</div>
                  <div className="text-sm leading-snug text-muted">{g.tagline}</div>
                </div>
                <Button
                  data-testid={`home-new-${g.id}`}
                  disabled={busy || !api.online}
                  className="!px-4"
                  onClick={() => void run(api.create(g.id))}
                >
                  New
                </Button>
              </Card>
            ))}
          </div>
        </section>

        <section aria-label="Join a game">
          <SectionLabel>Join with a code</SectionLabel>
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
              className="hud min-h-14 min-w-0 flex-1 bg-panel px-4 text-center text-2xl font-bold uppercase tracking-[0.3em] text-ink outline-none placeholder:text-muted/40 focus:!border-neon"
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
