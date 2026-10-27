import { PlayerName } from '../components/PlayerName';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { displayName } from '@pogo/shared';
import type { AVATARS, AuthResponse, PublicRoomSummary, PublicUser } from '@pogo/shared';
import { PEAK_ART, PogoStage, Wordmark, introDone, markIntroSeen } from '../components/PogoStage';
import { InstallCard } from '../components/InstallCard';
import { SlidersIcon, TrophyIcon } from '../components/icons';
import { LeaderboardSheet } from '../components/LeaderboardSheet';
import { ProfileSheet } from '../components/ProfileSheet';
import type { ProfileMode } from '../components/ProfileSheet';
import { PlayScreen } from '../components/PlayScreen';
import { Avatar, Button, SectionLabel } from '../components/ui';
import { rememberGameCard } from '../lib/cardMorph';
import { fetchDeveloper, fetchOnline } from '../lib/session';
import { TileButton } from '../components/TopBar';
import { FriendsButton } from '../friends/FriendsButton';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { AvatarFace } from '../components/AvatarFace';

/** The logo sits this many px below the exact midpoint, so its tilted corner stays clear of the top bar. */
const LOGO_NUDGE = 10;

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
  const [screen, setScreen] = useState<'menu' | 'play'>('menu');
  // Play is a history entry, so the phone's back gesture or button returns to the menu
  // (instead of leaving the app), and an edge swipe does the same inside an installed app.
  const open = (next: 'play') => {
    markIntroSeen();
    history.pushState({ pogo: next }, '');
    setScreen(next);
  };
  const back = () => {
    if (history.state?.pogo) history.back();
    else setScreen('menu');
  };
  useEffect(() => {
    const onPop = () => setScreen((history.state?.pogo as 'play' | undefined) ?? 'menu');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // Opening animation: the menu only slides in when Pogo lands on his stick (once per page load).
  const [landed, setLanded] = useState(introDone);
  // "Playing as <name>" slides out when the screen is there and back after 5 seconds.
  const [nameOut, setNameOut] = useState(false);
  useEffect(() => {
    if (!landed) return;
    const out = setTimeout(() => setNameOut(true), 300);
    const back = setTimeout(() => setNameOut(false), 5300);
    return () => {
      clearTimeout(out);
      clearTimeout(back);
    };
  }, [landed]);
  const [developer, setDeveloper] = useState<string | null>(null);
  useEffect(() => {
    void fetchDeveloper().then(setDeveloper);
  }, []);
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    const load = () => void fetchOnline().then(setOnline);
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [profileMode, setProfileMode] = useState<ProfileMode>('main');

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

  // Where the logo goes: the middle of the gap between the bottom of the top bar (or the install banner,
  // when it is there) and the top of the toad's highest jump (45 art px above the bottom of his stage).
  const headerEl = useRef<HTMLElement>(null);
  const frogBox = useRef<HTMLDivElement>(null);
  const [wordMid, setWordMid] = useState(120);
  useLayoutEffect(() => {
    const box = stageBox.current?.getBoundingClientRect();
    const frog = frogBox.current?.getBoundingClientRect();
    const header = headerEl.current?.getBoundingClientRect();
    if (!box || !frog || !header) return;
    const top = Math.max(header.bottom, box.top);
    const peak = frog.bottom - PEAK_ART * stageScale.frog;
    // (+10px: the tilted logo's upper corner must not clip into the top bar.)
    setWordMid((top + peak) / 2 - box.top + LOGO_NUDGE);
  }, [stageH, stageScale.frog, screen, landed]);

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
      {/* Only on the menu: the Play screen has no top bar, its first bar is the join-by-code bar (the same
          height and place as the lobby's bar, so nothing jumps between them). */}
      {screen === 'menu' && (
        <header
          ref={headerEl}
          data-in={landed}
          className="slide-top flex items-center gap-2.5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
        >
          {/* Top left: my picture; "Playing as <name>" swipes out next to it for 5 seconds, then slides back. */}
          {/* The same icon as in the crew list: the picture fills a rounded tile with the gold ring and the dark outline. */}
          <button
            type="button"
            onClick={() => {
              setProfileMode('main');
              setProfileOpen(true);
            }}
            aria-label="Your profile"
            data-testid="home-avatar"
            data-avatar={user.avatar}
            className="relative z-10 shrink-0 active:translate-y-px"
          >
            <Avatar avatar={user.avatar} size="md" />
          </button>
          <div
            className="min-w-0 flex-1 overflow-hidden"
            data-testid="home-playing-as"
            data-open={nameOut}
          >
            <p
              className="label whitespace-nowrap text-onbg/70 transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: nameOut ? 'none' : 'translateX(-110%)' }}
            >
              Playing as{' '}
              <span data-testid="home-nickname" className="text-onbg">
                <PlayerName name={displayName(user)} />
              </span>
            </p>
          </div>
          <TileButton
            onClick={() => setBoardOpen(true)}
            aria-label="Leaderboard"
            data-testid="home-leaderboard"
          >
            <TrophyIcon className="h-5 w-5" />
          </TileButton>
          <FriendsButton />
          <TileButton onClick={onSettings} aria-label="Settings" data-testid="settings-button">
            <SlidersIcon className="h-5 w-5" />
          </TileButton>
        </header>
      )}

      <main
        className={`flex min-h-0 flex-1 flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${
          screen === 'menu' ? 'pt-1' : 'pt-[calc(env(safe-area-inset-top)+1.25rem)]'
        }`}
      >
        {screen === 'menu' && (
          <>
            {landed && <InstallCard variant="banner" />}
            <div
              ref={stageBox}
              className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden pb-4"
            >
              {/* The logo sits exactly halfway between the bottom of the top bar and the highest point the toad reaches. */}
              <div
                className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
                style={{ top: wordMid, transform: 'translateY(-50%)' }}
              >
                <Wordmark shown={landed} width={stageScale.word * 30} flat />
              </div>
              <div ref={frogBox} className="w-full">
                <PogoStage scale={stageScale.frog} onLanded={() => setLanded(true)} />
              </div>
            </div>
            <div data-in={landed} className="slide-bottom flex flex-col gap-4">
              {online !== null && online > 0 && (
                <p className="label text-center text-onbg/70" data-testid="home-online">
                  There {online === 1 ? 'is 1 player' : `are ${online} players`} online
                </p>
              )}
              <Button
                data-testid="home-play"
                variant="gold"
                className="!min-h-[clamp(3.5rem,10dvh,6rem)] !text-3xl"
                onClick={() => open('play')}
              >
                Play
              </Button>
            </div>
            <p
              data-in={landed}
              className="slide-bottom label text-center text-onbg/70"
              data-testid="home-credit"
            >
              {developer ? (
                <>
                  Developed by <PlayerName name={developer} />
                </>
              ) : (
                <>Developed with Claude</>
              )}
              {developer && <span className="ml-1 text-[9px] opacity-80">(and Claude)</span>}
            </p>
          </>
        )}

        {screen === 'play' && (
          <PlayScreen
            api={api}
            lobby={lobby}
            watchLobby={watchLobby}
            onMainScreen={back}
            // The card morphs to the top of the lobby (lib/cardMorph.ts).
            onPick={(g, el) => {
              rememberGameCard(el);
              return api.create(g.id);
            }}
          />
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
