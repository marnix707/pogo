import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicRoomSummary, PublicUser } from '@pogo/shared';
import { InstallCard } from '../components/InstallCard';
import { LogoMark } from '../components/icons';
import { AVATARS } from '@pogo/shared';
import { Avatar, Button, SectionLabel, Sheet } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { gameUis, getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { avatarEmoji } from '../lib/avatars';

function OpenGame({
  room,
  disabled,
  onJoin,
}: {
  room: PublicRoomSummary;
  disabled: boolean;
  onJoin: () => void;
}) {
  const ui = getGameUi(room.gameId);
  return (
    <li data-testid={`open-game-${room.code}`} className="hud flex items-center gap-3 px-3 py-2.5">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border-2 border-neon bg-panel2 text-2xl"
        aria-hidden
      >
        {avatarEmoji(room.hostAvatar)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{room.hostNickname}&apos;s game</div>
        <div className="label flex items-center gap-2 text-[10px] text-muted">
          <span>
            {ui?.emoji} {room.gameName}
          </span>
          <span className="flex gap-1" aria-label={`${room.players} of ${room.maxPlayers} players`}>
            {Array.from({ length: Math.min(room.maxPlayers, 8) }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${i < room.players ? 'bg-accent' : 'border border-muted/60'}`}
              />
            ))}
          </span>
          <span>
            {room.players}/{room.maxPlayers}
          </span>
        </div>
      </div>
      <Button
        data-testid={`lobby-join-${room.code}`}
        disabled={disabled}
        className="min-h-11 !px-4"
        onClick={onJoin}
      >
        Join
      </Button>
    </li>
  );
}

export function Home({
  user,
  api,
  lobby,
  watchLobby,
  onSettings,
  onAvatar,
}: {
  user: PublicUser;
  api: RoomApi;
  lobby: PublicRoomSummary[] | null;
  watchLobby: () => () => void;
  onSettings: () => void;
  /** Save a new icon for this player. */
  onAvatar: (avatar: (typeof AVATARS)[number]) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  // Live-update the open games while this screen is showing.
  useEffect(() => watchLobby(), [watchLobby]);

  const openGames = useMemo(
    () => (lobby ?? []).filter((r) => filter === 'all' || r.gameId === filter),
    [lobby, filter],
  );

  async function run(p: Promise<unknown>) {
    setBusy(true);
    await p;
    setBusy(false);
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) void run(api.join(code));
  }

  const blocked = busy || !api.online;

  return (
    <div className="menu mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar
        title="Po:go"
        subtitle="Play Online, GO!"
        left={<LogoMark className="h-11 w-11 shrink-0" />}
        onSettings={onSettings}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 pb-8 pt-2">
        {/* Who I am, and joining with a code, side by side */}
        <div className="hud flex items-center gap-3 p-3">
          <button
            type="button"
            data-testid="home-avatar"
            data-avatar={user.avatar}
            aria-label="Change your icon"
            onClick={() => setPicking(true)}
            className="shrink-0 active:translate-y-px"
          >
            <Avatar avatar={user.avatar} size="lg" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="label text-muted">Pilot</div>
            <div className="truncate text-xl font-bold" data-testid="home-nickname">
              {user.nickname}
            </div>
          </div>
          <form onSubmit={join} className="flex shrink-0 gap-2" aria-label="Join with a code">
            <input
              data-testid="home-join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="CODE"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Room code"
              className="hud min-h-12 w-[5.5rem] min-w-0 bg-panel px-2 text-center text-lg font-bold uppercase tracking-[0.2em] text-ink outline-none placeholder:text-muted/40 focus:!border-neon"
            />
            <Button
              data-testid="home-join-submit"
              disabled={blocked || code.length < 4}
              className="!min-h-12 !px-3"
            >
              Join
            </Button>
          </form>
        </div>

        <InstallCard variant="banner" />

        <section aria-label="Open games">
          <SectionLabel
            right={
              <span data-testid="open-games-count" className="text-onbg">
                {openGames.length}
              </span>
            }
          >
            Open games
          </SectionLabel>
          {gameUis.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {[{ id: 'all', name: 'All' }, ...gameUis].map((g) => (
                <button
                  key={g.id}
                  aria-pressed={filter === g.id}
                  onClick={() => setFilter(g.id)}
                  className={`label min-h-9 rounded-md border-2 px-3 ${
                    filter === g.id
                      ? 'border-accent bg-accent text-accentink'
                      : 'border-onbg/40 text-onbg'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {lobby === null ? (
            <p className="label text-onbg/70">Looking for games…</p>
          ) : openGames.length === 0 ? (
            <div className="hud p-4 text-center text-sm text-muted" data-testid="open-games-empty">
              No open games right now. Pick a game below to open its lobby, and switch on{' '}
              <b className="text-ink">Public room</b> there so others can join.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {openGames.map((r) => (
                <OpenGame
                  key={r.code}
                  room={r}
                  disabled={blocked}
                  onJoin={() => void run(api.join(r.code))}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Games">
          <SectionLabel>Play</SectionLabel>
          <div className="flex flex-col gap-3">
            {gameUis.map((g) => (
              <button
                key={g.id}
                type="button"
                data-testid={`home-game-${g.id}`}
                disabled={blocked}
                onClick={() => void run(api.create(g.id))}
                className="hud hud-ticks flex w-full items-center gap-4 bg-panel p-4 text-left text-ink transition active:scale-[0.99] disabled:opacity-50"
              >
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-accent text-4xl"
                  aria-hidden
                >
                  {g.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold uppercase tracking-[0.12em]">
                    {g.name}
                  </span>
                  <span className="block text-sm leading-snug text-muted">{g.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Pick your icon">
        <div className="grid grid-cols-4 gap-3">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              data-testid={`pick-avatar-${a}`}
              aria-label={a}
              aria-pressed={user.avatar === a}
              onClick={() => {
                setPicking(false);
                if (a !== user.avatar) void onAvatar(a);
              }}
              className={`flex aspect-square items-center justify-center rounded-[8px] border-2 text-4xl ring-2 ring-line transition active:translate-y-px ${
                user.avatar === a ? 'border-neon bg-neon/20' : 'border-edge/40 bg-panel2'
              }`}
            >
              {avatarEmoji(a)}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
