import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatError } from '@pogo/shared';
import type { AuthResponse, Result, RoomSettingsInput } from '@pogo/shared';
import { ChatBanner } from './components/ChatBanner';
import { FriendsProvider } from './friends/FriendsProvider';
import { markIntroSeen } from './components/PogoStage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { SettingsSheet } from './components/SettingsSheet';
import { SwitchPlayerSheet } from './components/SwitchPlayerSheet';
import { useToast } from './components/Toast';
import type { RoomApi } from './lib/api';
import { haptic } from './lib/haptics';
import { updateProfile } from './lib/session';
import { useRealtime } from './lib/socket';
import { play } from './lib/sound';
import { GameScreen } from './pages/GameScreen';
import { SpectatorScreen } from './pages/SpectatorScreen';
import { ProfileSheet } from './components/ProfileSheet';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';

const LEFT_MESSAGE = {
  kicked: 'You were removed from the room',
  closed: 'That room has closed',
  timeout: 'You were disconnected for too long and removed from the lobby',
  left: '',
} as const;

/** Signed-in app: owns the realtime connection and routes by where the server says you are. */
export function Shell({
  session,
  onUser,
  onSession,
  onSignOut,
}: {
  session: AuthResponse;
  /** The signed-in user changed (a new icon). */
  onUser: (user: AuthResponse['user']) => void;
  /** Logged in as another user: swap the whole session. */
  onSession: (session: AuthResponse) => void;
  onSignOut: () => void;
}) {
  const {
    connection,
    room,
    synced,
    leftReason,
    messages,
    readUpTo,
    markRead,
    lobby,
    watchLobby,
    request,
    banned,
    socialTick,
    onDm,
    onInvite,
  } = useRealtime(session.token);
  const toast = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const online = connection === 'online';

  // Every request goes through here so failures are surfaced the same way everywhere.
  const run = useCallback(
    async (p: Promise<Result<unknown>>) => {
      const res = await p;
      if (!res.ok) {
        toast.show(formatError(res.error, res.code, res.ref), 'error');
        haptic('error');
        play('error');
      }
      return res;
    },
    [toast],
  );

  const api: RoomApi = useMemo(
    () => ({
      online,
      create: (gameId) => run(request('room:create', { gameId })),
      quickPlay: (gameId) => run(request('room:quickplay', { gameId })),
      playComputer: (gameId, bots) =>
        run(request('room:create', { gameId, visibility: 'private', bots, autoStart: true })),
      sendChat: (text) => run(request('chat:send', { text })),
      join: (code) => run(request('room:join', { code })),
      leave: () => run(request('room:leave', {})),
      kick: (userId) => run(request('room:kick', { userId })),
      updateSettings: (patch: RoomSettingsInput) => run(request('room:settings', patch)),
      setGame: (gameId) => run(request('room:setGame', { gameId })),
      ready: (ready) => run(request('room:ready', { ready })),
      suggest: (gameId) => run(request('room:suggest', { gameId })),
      readyLock: (locked) => run(request('room:readyLock', { locked })),
      rematch: (toLobby) => run(request('room:rematch', { toLobby })),
      move: (move) => run(request('game:move', { move })),
    }),
    [online, request, run],
  );

  // Share links look like /?join=ABCDE: join once connected, then tidy the URL.
  const joinHandled = useRef(false);
  useEffect(() => {
    if (joinHandled.current || !synced || !online) return;
    const code = new URLSearchParams(window.location.search).get('join');
    joinHandled.current = true;
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    void api.join(code);
  }, [synced, online, api]);

  // Explain why a room disappeared (kicked, closed, ...).
  useEffect(() => {
    const message = leftReason ? LEFT_MESSAGE[leftReason.reason] : '';
    if (message) toast.show(message, 'error');
  }, [leftReason, toast]);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  // Going into a game room counts as having seen the opening animation (it never replays on return).
  useEffect(() => {
    if (room) markIntroSeen();
  }, [room]);

  let screen;
  if (banned) {
    screen = (
      <div className="mx-auto max-w-md p-8 text-center" data-testid="banned">
        <h1 className="mb-3 text-2xl font-bold uppercase tracking-[0.12em] text-onbg">Banned</h1>
        <p className="mb-6 text-onbg/90">{banned}</p>
        <button className="underline" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    );
  } else if (!synced) {
    screen = <p className="label p-8 text-center text-onbg">Connecting…</p>;
  } else if (!room) {
    screen = (
      <Home
        user={session.user}
        api={api}
        lobby={lobby}
        watchLobby={watchLobby}
        onSettings={openSettings}
        token={session.token}
        onUser={onUser}
        onSession={onSession}
        onSignOut={onSignOut}
        onProfile={async (profile) => {
          try {
            onUser(await updateProfile(session.token, profile));
          } catch (e) {
            toast.show((e as Error).message, 'error');
          }
        }}
      />
    );
  } else if (room.status === 'lobby') {
    screen = (
      <Lobby
        room={room}
        me={session.user.id}
        api={api}
        messages={messages}
        markRead={markRead}
        onSettings={openSettings}
        lobbyList={lobby}
        watchLobby={watchLobby}
        user={session.user}
        token={session.token}
        onUser={onUser}
        onSession={onSession}
        onSignOut={onSignOut}
        onProfile={async (profile) => {
          try {
            onUser(await updateProfile(session.token, profile));
          } catch (e) {
            toast.show((e as Error).message, 'error');
          }
        }}
      />
    );
  } else if (room.spectating) {
    screen = (
      <SpectatorScreen
        room={room}
        me={session.user.id}
        api={api}
        messages={messages}
        onSettings={openSettings}
      />
    );
  } else {
    screen = (
      <GameScreen
        room={room}
        me={session.user.id}
        api={api}
        messages={messages}
        readUpTo={readUpTo}
        markRead={markRead}
        onSettings={openSettings}
        account={{
          token: session.token,
          isGuest: session.user.isGuest,
          onRegister: () => setRegisterOpen(true),
        }}
      />
    );
  }

  return (
    <FriendsProvider
      token={session.token}
      me={session.user}
      room={room}
      socialTick={socialTick}
      onDm={onDm}
      onInvite={onInvite}
      joinRoom={(code) => api.join(code)}
    >
      <ConnectionBanner connection={connection} />
      {room && <ChatBanner key={room.code} messages={messages} me={session.user.id} />}
      {screen}
      <ProfileSheet
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        user={session.user}
        token={session.token}
        initial="register"
        onProfile={async (profile) => {
          try {
            onUser(await updateProfile(session.token, profile));
          } catch (e) {
            toast.show((e as Error).message, 'error');
          }
        }}
        onUser={onUser}
        onSession={onSession}
        onSignOut={onSignOut}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        nickname={session.user.nickname}
        // A guest is asked first (the dialog says what can be recovered); an account just signs out.
        onSignOut={() => {
          setSettingsOpen(false);
          if (session.user.isGuest) setSwitchOpen(true);
          else onSignOut();
        }}
        roomCode={room?.code}
        isDev={!!session.user.isDev}
        onLeave={
          room?.status === 'lobby' || room?.spectating
            ? () => {
                setSettingsOpen(false);
                void api.leave();
              }
            : undefined
        }
      />
      <SwitchPlayerSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        user={session.user}
        token={session.token}
        onSwitch={onSignOut}
        onRegister={() => {
          setSwitchOpen(false);
          setRegisterOpen(true);
        }}
      />
    </FriendsProvider>
  );
}
