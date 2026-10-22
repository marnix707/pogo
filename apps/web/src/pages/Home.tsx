import { PlayerName } from '../components/PlayerName';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { displayName } from '@pogo/shared';
import type { AVATARS, AuthResponse, PublicRoomSummary, PublicUser } from '@pogo/shared';
import { PogoStage, Wordmark, introDone, markIntroSeen } from '../components/PogoStage';
import { InstallCard } from '../components/InstallCard';
import { ArrowLeftIcon, SlidersIcon, TrophyIcon } from '../components/icons';
import { LeaderboardSheet } from '../components/LeaderboardSheet';
import { ProfileSheet } from '../components/ProfileSheet';
import type { ProfileMode } from '../components/ProfileSheet';
import { Button, SectionLabel } from '../components/ui';
import { TileButton } from '../components/TopBar';
import { gameUis, getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { AvatarFace } from '../components/AvatarFace';

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

export function Home({
  user,
  api,
  lobby,
  watchLobby,
  onSettings,
  onProfile,
  token,
  onUser,
  onSession,
  onSignOut,
}: {
  user: PublicUser;
  api: RoomApi;
  lobby: PublicRoomSummary[] | null;
  watchLobby: () => () => void;
  onSettings: () => void;
  token: string;
  onUser: (user: PublicUser) => void;
  onSession: (auth: AuthResponse) => void;
  onSignOut: () => void;
  /** Save a new name and/or icon for this player. */
  onProfile: (profile: { nickname: string; avatar: (typeof AVATARS)[number] }) => Promise<void>;
}) {
  const [screen, setScreen] = useState<'menu' | 'play' | 'join'>('menu');
  // Play / Join are history entries, so the phone's back gesture or button returns to the menu
  // (instead of leaving the app), and an edge swipe does the same inside an installed app.
  const open = (next: 'play' | 'join') => {
    markIntroSeen();
    history.pushState({ pogo: next }, '');
    setScreen(next);
  };
  const back = () => {
    if (history.state?.pogo) history.back();
    else setScreen('menu');
  };
  useEffect(() => {
    const onPop = () => setScreen((history.state?.pogo as 'play' | 'join' | undefined) ?? 'menu');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // Opening animation: the menu only slides in when Pogo lands on his stick (once per page load).
  const [landed, setLanded] = useState(introDone);
  const [profileOpen, setProfileOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [profileMode, setProfileMode] = useState<ProfileMode>('main');
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

  // The wordmark and toad fill the free height between the header and the buttons: measure it and
  // scale both down (never up) so the whole menu always fits the screen without scrolling.
  const stageBox = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState(0);
  useEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const measure = () => setStageH(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [screen]);
  /** Height (px) the wordmark + toad group needs at full size (toad 4.375, wordmark 11). */
  const STAGE_NEED = 340;
  const fit = stageH > 0 ? Math.min(1, stageH / STAGE_NEED) : 1;
  const stageScale = { frog: 4.375 * fit, word: 11 * fit };

  const blocked = busy || !api.online;

  return (
    <div
      className={`menu mx-auto flex max-w-md flex-col ${screen === 'menu' ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}
      onTouchStart={(e) => {
        const t = e.touches[0];
        // Only a swipe that starts at the left screen edge counts.
        swipe.current = t && t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = swipe.current;
        const t = e.changedTouches[0];
        swipe.current = null;
        if (!start || !t || screen === 'menu') return;
        if (t.clientX - start.x > 70 && Math.abs(t.clientY - start.y) < 60) back();
      }}
    >
      <header
        data-in={landed}
        className="slide-top flex items-center gap-2.5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="min-w-0 flex-1" />
        <TileButton
          onClick={() => setBoardOpen(true)}
          aria-label="Leaderboard"
          data-testid="home-leaderboard"
        >
          <TrophyIcon className="h-5 w-5" />
        </TileButton>
        <TileButton
          onClick={() => {
            setProfileMode('main');
            setProfileOpen(true);
          }}
          aria-label="Your profile"
          data-testid="home-avatar"
          data-avatar={user.avatar}
        >
          <span className="text-2xl leading-none" aria-hidden>
            <AvatarFace avatar={user.avatar} />
          </span>
        </TileButton>
        <TileButton onClick={onSettings} aria-label="Settings" data-testid="settings-button">
          <SlidersIcon className="h-5 w-5" />
        </TileButton>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
        {screen === 'menu' && (
          <>
            {landed && <InstallCard variant="banner" />}
            <div
              ref={stageBox}
              className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden pb-4"
            >
              <Wordmark shown={landed} width={stageScale.word * 30} drop={100 * fit} />
              <PogoStage scale={stageScale.frog} onLanded={() => setLanded(true)} />
            </div>
            <div data-in={landed} className="slide-bottom flex flex-col gap-4">
              <Button
                data-testid="home-play"
                variant="gold"
                className="!min-h-[clamp(3.5rem,10dvh,6rem)] !text-3xl"
                onClick={() => open('play')}
              >
                Play
              </Button>
              <Button
                data-testid="home-join"
                variant="secondary"
                className="!min-h-[clamp(3.5rem,10dvh,6rem)] !text-3xl"
                onClick={() => open('join')}
              >
                Join
              </Button>
            </div>
            <p data-in={landed} className="slide-bottom label text-center text-onbg/70">
              Playing as{' '}
              <span data-testid="home-nickname" className="text-onbg">
                <PlayerName name={displayName(user)} />
              </span>
            </p>
          </>
        )}

        {screen !== 'menu' && (
          <button
            type="button"
            data-testid="home-back"
            onClick={back}
            className="label flex items-center gap-2 self-start text-onbg"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Back
          </button>
        )}

        {screen === 'join' && (
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
                <div
                  className="hud p-4 text-center text-sm text-muted"
                  data-testid="open-games-empty"
                >
                  No open games right now. Press Play to open a lobby, and switch on{' '}
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
        )}

        {screen === 'play' && (
          <section aria-label="Games">
            <SectionLabel>Games</SectionLabel>
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
        )}
      </main>

      <LeaderboardSheet
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        me={user.id}
        isGuest={user.isGuest}
        onRegister={() => {
          setBoardOpen(false);
          setProfileMode('register');
          setProfileOpen(true);
        }}
      />
      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        token={token}
        initial={profileMode}
        onProfile={onProfile}
        onUser={onUser}
        onSession={onSession}
        onSignOut={onSignOut}
      />
    </div>
  );
}
