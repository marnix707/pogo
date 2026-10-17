import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import {
  APP_NAME,
  emptyPayloadSchema,
  gameMoveEnvelopeSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomKickSchema,
  roomSettingsSchema,
} from '@pogo/shared';
import type { ClientToServerEvents, PublicUser, Result, ServerToClientEvents } from '@pogo/shared';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';
import type { RoomManager } from '../rooms/RoomManager';
import { createRateLimiter } from './rateLimit';

export interface SocketData {
  user: PublicUser;
}

export type PogoServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export const userChannel = (userId: string) => `user:${userId}`;

interface Deps {
  io: PogoServer;
  manager: RoomManager;
  users: UserStore;
  tokens: TokenService;
  log: FastifyBaseLogger;
}

export function registerSocketHandlers({ io, manager, users, tokens, log }: Deps): void {
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const userId = typeof token === 'string' ? await tokens.verify(token) : null;
    const user = userId ? await users.get(userId) : null;
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  const socketCount = new Map<string, number>();

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const log_ = log.child({ userId: user.id, socketId: socket.id });
    void socket.join(userChannel(user.id));

    const count = (socketCount.get(user.id) ?? 0) + 1;
    socketCount.set(user.id, count);
    if (count === 1) manager.userConnected(user.id);
    log_.info('socket connected');

    socket.emit('hello', {
      message: `Welcome to ${APP_NAME}, ${user.nickname}`,
      serverTime: Date.now(),
    });
    // Tell this socket where the user is (rejoin after refresh / reconnect).
    socket.emit('room:state', manager.getView(user.id));

    const allow = createRateLimiter(20, 10);
    // Registered with a loose socket type: payloads are `unknown` until parsed by their schema.
    const raw = socket as unknown as Socket;

    function route<P>(
      event: string,
      schema: z.ZodType<P, z.ZodTypeDef, unknown>,
      run: (payload: P) => Result<unknown>,
    ) {
      raw.on(event, (payload: unknown, ack?: unknown) => {
        const reply = (result: Result<unknown>) => {
          if (typeof ack === 'function') ack(result);
        };
        if (!allow()) return reply({ ok: false, error: 'Slow down a little' });
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) return reply({ ok: false, error: 'Invalid request' });
        try {
          reply(run(parsed.data));
        } catch (err) {
          log_.error({ err, event }, 'socket handler failed');
          reply({ ok: false, error: 'Something went wrong' });
        }
      });
    }

    route('room:create', roomCreateSchema, (p) => manager.create(user, p));
    route('room:join', roomJoinSchema, (p) => manager.join(user, p.code));
    route('room:leave', emptyPayloadSchema, () => manager.leave(user.id));
    route('room:kick', roomKickSchema, (p) => manager.kick(user.id, p.userId));
    route('room:settings', roomSettingsSchema, (p) => manager.updateSettings(user.id, p));
    route('room:start', emptyPayloadSchema, () => manager.start(user.id));
    route('room:rematch', emptyPayloadSchema, () => manager.rematch(user.id));
    route('game:move', gameMoveEnvelopeSchema, (p) => manager.move(user.id, p.move));

    socket.on('disconnect', (reason) => {
      const remaining = (socketCount.get(user.id) ?? 1) - 1;
      if (remaining <= 0) {
        socketCount.delete(user.id);
        manager.userDisconnected(user.id);
      } else {
        socketCount.set(user.id, remaining);
      }
      log_.info({ reason }, 'socket disconnected');
    });
  });
}
