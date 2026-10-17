import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  LeaveReason,
  Result,
  RoomView,
  ServerToClientEvents,
} from '@pogo/shared';

type PogoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type Connection = 'connecting' | 'online' | 'offline';

/** One authenticated socket for the session; mirrors the server's view of "my room". */
export function useRealtime(token: string) {
  const socketRef = useRef<PogoSocket | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [leftReason, setLeftReason] = useState<LeaveReason>();

  useEffect(() => {
    const socket: PogoSocket = io({ auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => setConnection('online'));
    socket.on('disconnect', () => setConnection('offline'));
    socket.io.on('reconnect_attempt', () => setConnection('connecting'));
    socket.on('room:state', (next, reason) => {
      setRoom(next);
      setLeftReason(next ? undefined : reason);
    });
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
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected' });
        const emit = socket.emit.bind(socket) as (e: string, p: unknown, ack: unknown) => void;
        emit(event, payload, resolve);
      }),
    [],
  );

  return { connection, room, leftReason, request };
}
