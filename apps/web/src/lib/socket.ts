import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ChatMessage,
  ClientToServerEvents,
  DirectMessageView,
  GameInviteView,
  LeaveReason,
  PublicRoomSummary,
  Result,
  RoomView,
  ServerToClientEvents,
} from '@pogo/shared';

type PogoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type Connection = 'connecting' | 'online' | 'offline';

const CHAT_KEEP = 100;

/** One authenticated socket for the session; mirrors the server's view of "my room". */
export function useRealtime(token: string) {
  const socketRef = useRef<PogoSocket | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<RoomView | null>(null);
  /** True once the server has told us where we are (a room or none) since connecting. */
  const [synced, setSynced] = useState(false);
  const [leftReason, setLeftReason] = useState<{ reason: LeaveReason; at: number }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readUpTo, setReadUpTo] = useState(0);
  const [lobby, setLobby] = useState<PublicRoomSummary[] | null>(null);
  /** Set when the server refuses this player because of a ban. */
  const [banned, setBanned] = useState<string | null>(null);
  /** Bumps when friends, requests or blocks changed (the friends list refetches). */
  const [socialTick, setSocialTick] = useState(0);
  const dmListeners = useRef(new Set<(m: DirectMessageView) => void>());
  const inviteListeners = useRef(new Set<(i: GameInviteView) => void>());
  const roomCodeRef = useRef<string>();
  const lobbyWatchers = useRef(0);

  useEffect(() => {
    const socket: PogoSocket = io({ auth: { token } });
    socketRef.current = socket;
    // A ban ends the session for good: stop reconnecting and say why.
    socket.on('connect_error', (err) => {
      if (err.message !== 'banned') return;
      setBanned(
        (err as Error & { data?: { message?: string } }).data?.message ?? 'You are banned.',
      );
      socket.disconnect();
    });

    const subscribeLobby = () => {
      if (lobbyWatchers.current === 0) return;
      socket.emit('lobby:subscribe', {}, (res) => {
        if (res.ok) setLobby(res.data);
      });
    };

    socket.on('connect', () => {
      setConnection('online');
      subscribeLobby(); // socket.io rooms do not survive a reconnect
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.io.on('reconnect_attempt', () => setConnection('connecting'));
    socket.on('room:state', (next, reason) => {
      const previous = roomCodeRef.current;
      roomCodeRef.current = next?.code;
      // New room (or none): start with an empty chat. History for a room we are (re)entering
      // can arrive just before this event, so only clear when we are really switching away.
      if (!next || (previous && next.code !== previous)) {
        setMessages([]);
        setReadUpTo(0);
      }
      setRoom(next);
      setSynced(true);
      if (!next && reason) setLeftReason({ reason, at: Date.now() });
    });
    socket.on('chat:history', (history) => setMessages(history.slice(-CHAT_KEEP)));
    socket.on('chat:message', (message) =>
      setMessages((all) =>
        all.some((m) => m.id === message.id) ? all : [...all, message].slice(-CHAT_KEEP),
      ),
    );
    socket.on('lobby:list', setLobby);
    socket.on('social:update', () => setSocialTick((t) => t + 1));
    socket.on('dm:message', (m) => dmListeners.current.forEach((fn) => fn(m)));
    socket.on('game:invite', (i) => inviteListeners.current.forEach((fn) => fn(i)));
    // Somebody rings the bell in the lobby: BellFx shakes the screen and rings.
    socket.on('room:bell', (bell) =>
      window.dispatchEvent(new CustomEvent('pogo:bell', { detail: bell })),
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const request = useCallback(
    <E extends keyof ClientToServerEvents>(
      event: E,
      payload: Parameters<ClientToServerEvents[E]>[0],
    ) =>
      new Promise<Result<unknown>>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'You are offline' });
        const emit = socket.emit.bind(socket) as (e: string, p: unknown, ack: unknown) => void;
        emit(event, payload, resolve);
      }),
    [],
  );

  /** Subscribe to live public-room updates while a screen needs them. Returns the cleanup. */
  const watchLobby = useCallback(() => {
    lobbyWatchers.current++;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('lobby:subscribe', {}, (res) => {
        if (res.ok) setLobby(res.data);
      });
    }
    return () => {
      lobbyWatchers.current--;
      if (lobbyWatchers.current === 0) {
        socketRef.current?.emit('lobby:unsubscribe', {}, () => {});
      }
    };
  }, []);

  const onDm = useCallback((fn: (m: DirectMessageView) => void) => {
    dmListeners.current.add(fn);
    return () => void dmListeners.current.delete(fn);
  }, []);
  const onInvite = useCallback((fn: (i: GameInviteView) => void) => {
    inviteListeners.current.add(fn);
    return () => void inviteListeners.current.delete(fn);
  }, []);

  const markRead = useCallback(() => {
    setReadUpTo((current) => Math.max(current, ...messages.map((m) => m.id)));
  }, [messages]);

  return {
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
  };
}
