import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthResponse, Result, RoomSettingsInput } from '@pogo/shared';
import { ConnectionBanner } from './components/ConnectionBanner';
import { SettingsSheet } from './components/SettingsSheet';
import { useToast } from './components/Toast';
import type { RoomApi } from './lib/api';
import { haptic } from './lib/haptics';
import { useRealtime } from './lib/socket';
import { play } from './lib/sound';
import { GameScreen } from './pages/GameScreen';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';

const LEFT_MESSAGE = {
  kicked: 'You were removed from the room',
  closed: 'That room has closed',
  timeout: 'You were disconnected for too long and removed from the lobby',
  left: '',
} as const;

/** Signed-in app: owns the realtime connection and routes by where the server says you are. */
export function Shell({ session, onSignOut }: { session: AuthResponse; onSignOut: () => void }) {
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
  } = useRealtime(session.token);
  const toast = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const online = connection === 'online';

  // Every request goes through here so failures are surfaced the same way everywhere.
  const run = useCallback(
    async (p: Promise<Result<unknown>>) => {
      const res = await p;
      if (!res.ok) {
        toast.show(res.error, 'error');
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
      start: () => run(request('room:start', {})),
      rematch: () => run(request('room:rematch', {})),
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

  const openSettings = () => setSettingsOpen(true);

  let screen;
  if (!synced) {
    screen = <p className="label p-8 text-center text-onbg">Connecting…</p>;
  } else if (!room) {
    screen = (
      <Home
        user={session.user}
        api={api}
        lobby={lobby}
        watchLobby={watchLobby}
        onSettings={openSettings}
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
      />
    );
  }

  return (
    <>
      <ConnectionBanner connection={connection} />
      {screen}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        nickname={session.user.nickname}
        onSignOut={onSignOut}
      />
    </>
  );
}
