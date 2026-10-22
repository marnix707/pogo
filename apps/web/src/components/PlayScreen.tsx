import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicRoomSummary } from '@pogo/shared';
import { gameUis, getGameUi } from '../games/registry';
import type { GameUi } from '../games/types';
import type { RoomApi } from '../lib/api';
import { AvatarFace } from './AvatarFace';
import { GameCard } from './GameCard';
import { PlayerName } from './PlayerName';
import { Button, SectionLabel } from './ui';

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
        <AvatarFace avatar={room.hostAvatar} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">
          <PlayerName name={room.hostNickname} />
          &apos;s game
        </div>
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

/**
 * The Play screen: join with a code on top, the games, the open games underneath. The Home screen shows
 * it after Play; a lobby shows the very same screen when its host taps the game card at the top.
 */
export function PlayScreen({
  api,
  lobby,
  watchLobby,
  onPick,
  tooBigFor,
  currentId,
  gameIdPrefix = 'home-game',
}: {
  api: RoomApi;
  lobby: PublicRoomSummary[] | null;
  watchLobby: () => () => void;
  /** A game was tapped; may return a promise (the screen stays busy until it settles). */
  onPick: (game: GameUi, card: Element | null) => Promise<unknown> | void;
  /** Games that cannot seat the people in this lobby are greyed out and say so when tapped. */
  tooBigFor?: (gameId: string) => boolean;
  /** The lobby's current game (highlighted). */
  currentId?: string;
  gameIdPrefix?: string;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [note, setNote] = useState<{ id: string; n: number } | null>(null);

  // Live-update the open games while this screen is showing.
  useEffect(() => watchLobby(), [watchLobby]);

  const openGames = useMemo(
    () => (lobby ?? []).filter((r) => filter === 'all' || r.gameId === filter),
    [lobby, filter],
  );
  const blocked = busy || !api.online;

  async function run(p: Promise<unknown> | void) {
    setBusy(true);
    await p;
    setBusy(false);
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) void run(api.join(code));
  }

  return (
    <>
      <form onSubmit={join} className="hud flex gap-2 p-3" aria-label="Join with a code">
        <input
          data-testid="home-join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ROOM CODE"
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Room code"
          className="hud min-h-12 min-w-0 flex-1 bg-panel px-2 text-center text-lg font-bold uppercase tracking-[0.2em] text-ink outline-none placeholder:text-muted/40 focus:!border-neon"
        />
        <Button
          data-testid="home-join-submit"
          disabled={blocked || code.length < 4}
          className="!min-h-12 !px-4"
        >
          Join
        </Button>
      </form>

      <section aria-label="Games">
        <SectionLabel>Games</SectionLabel>
        <div className="flex flex-col gap-3">
          {gameUis.map((g) => {
            // More people in the lobby than the game seats: greyed out, and tapping says why.
            const tooBig = !!tooBigFor?.(g.id);
            return (
              <div key={g.id} className="relative">
                <GameCard
                  ui={g}
                  data-testid={`${gameIdPrefix}-${g.id}`}
                  disabled={blocked}
                  dim={tooBig}
                  className={g.id === currentId ? 'ring-2 ring-neon' : ''}
                  onClick={() => {
                    if (tooBig) {
                      setNote({ id: g.id, n: Date.now() });
                      return;
                    }
                    const el = document.querySelector(`[data-testid="${gameIdPrefix}-${g.id}"]`);
                    void run(onPick(g, el));
                  }}
                />
                {note?.id === g.id && (
                  <span
                    key={note.n}
                    role="status"
                    data-testid="party-too-big"
                    onAnimationEnd={() => setNote(null)}
                    className="float-note pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-xl font-bold text-white [text-shadow:0_2px_0_#101628,0_0_8px_#101628]"
                  >
                    Party size too big!
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
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
            No open games right now. Pick a game above to open a lobby, and switch on{' '}
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
    </>
  );
}
