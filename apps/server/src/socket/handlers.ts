import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import {
  APP_NAME,
  isStaff,
  chatSendSchema,
  emptyPayloadSchema,
  rematchSchema,
  gameMoveEnvelopeSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomKickSchema,
  roomQuickplaySchema,
  roomReadySchema,
  roomSettingsSchema,
  roomSetGameSchema,
  roomReadyLockSchema,
  roomSuggestSchema,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  failResult,
} from '@pogo/shared';
import type { ClientToServerEvents, PublicUser, Result, ServerToClientEvents } from '@pogo/shared';
import { banMessage } from '../admin/moderation';
import { newRef } from '../errors';
import type { BanList } from '../admin/moderation';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';
import type { RoomManager } from '../rooms/RoomManager';
import { forwardedClientIp } from '../clientIp';
import { createRateLimiter } from './rateLimit';

export interface SocketData {
  user: PublicUser;
}

type PogoSocket = Parameters<Parameters<PogoServer['use']>[0]>[0];
export type PogoServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export const userChannel = (userId: string) => `user:${userId}`;
/** Sockets subscribed to live updates of the public room list. */
export const LOBBY_CHANNEL = 'lobby';

/** Chat flood protection per user (across all their tabs): a burst of 5, then one per 2s. */
const CHAT_BURST = 5;
const CHAT_REFILL_PER_SEC = 0.5;

interface Deps {
  io: PogoServer;
  manager: RoomManager;
  users: UserStore;
  tokens: TokenService;
  bans: BanList;
  /** Read the client address from X-Forwarded-For (behind the host's proxy). */
  trustProxy: boolean;
  /** Proxies in front of the server (see clientIp.ts); unset = trust the whole header. */
  trustProxyHops?: number;
  log: FastifyBaseLogger;
}

function socketIp(socket: Socket | PogoSocket, trustProxy: boolean, hops?: number): string | null {
  const client = trustProxy
    ? forwardedClientIp(socket.handshake.headers['x-forwarded-for'], hops)
    : null;
  return client || socket.handshake.address || null;
}

export function registerSocketHandlers({
  io,
  manager,
  users,
  tokens,
  bans,
  trustProxy,
  trustProxyHops,
  log,
}: Deps): void {
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const userId = typeof token === 'string' ? await tokens.verify(token) : null;
    const user = userId ? await users.get(userId) : null;
    if (!user) return next(new Error('unauthorized'));
    // Banned accounts (and, except for staff, banned IP addresses) are turned away.
    const ip = socketIp(socket, trustProxy, trustProxyHops);
    const ban = bans.forUser(user.id) ?? (isStaff(user) ? null : bans.forIp(ip));
    if (ban)
      return next(Object.assign(new Error('banned'), { data: { message: banMessage(ban) } }));
    socket.data.user = user;
    void users.touch(user.id, ip);
    void users.recordVisit(user.id, Date.now());
    next();
  });

  const socketCount = new Map<string, number>();
  const chatLimiters = new Map<string, { allow: () => boolean; lastUsed: number }>();
  const chatAllowed = (userId: string) => {
    let entry = chatLimiters.get(userId);
    if (!entry) {
      if (chatLimiters.size > 5000) {
        const cutoff = Date.now() - 10 * 60_000;
        for (const [id, e] of chatLimiters) if (e.lastUsed < cutoff) chatLimiters.delete(id);
      }
      entry = { allow: createRateLimiter(CHAT_BURST, CHAT_REFILL_PER_SEC), lastUsed: 0 };
      chatLimiters.set(userId, entry);
    }
    entry.lastUsed = Date.now();
    return entry.allow();
  };

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
        if (!allow()) return reply(failResult('Slow down a little'));
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) return reply(failResult('Invalid request'));
        try {
          reply(run(parsed.data));
        } catch (err) {
          // The ref ties what the player sees to this log line.
          const ref = newRef();
          log_.error({ err, event, code: INTERNAL_ERROR_CODE, ref }, 'socket handler failed');
          reply(failResult(INTERNAL_ERROR_MESSAGE, { code: INTERNAL_ERROR_CODE, ref }));
        }
      });
    }

    route('room:create', roomCreateSchema, (p) => manager.create(user, p));
    route('room:join', roomJoinSchema, (p) => manager.join(user, p.code));
    route('room:leave', emptyPayloadSchema, () => manager.leave(user.id));
    route('room:kick', roomKickSchema, (p) => manager.kick(user.id, p.userId));
    route('room:settings', roomSettingsSchema, (p) => manager.updateSettings(user.id, p));
    route('room:setGame', roomSetGameSchema, (p) => manager.setGame(user.id, p.gameId));
    route('room:suggest', roomSuggestSchema, (p) => manager.suggest(user.id, p.gameId));
    route('room:readyLock', roomReadyLockSchema, (p) => manager.setReadyLock(user.id, p.locked));
    route('room:ready', roomReadySchema, (p) => manager.setReady(user.id, p.ready));
    route('room:bell', emptyPayloadSchema, () => manager.bell(user.id));
    route('room:rematch', rematchSchema, (p) => manager.rematch(user.id, p.toLobby));
    route('room:quickplay', roomQuickplaySchema, (p) => manager.quickPlay(user, p.gameId));
    route('chat:send', chatSendSchema, (p) =>
      chatAllowed(user.id)
        ? manager.chat(user.id, p.text)
        : failResult('You are sending messages too fast'),
    );
    route('lobby:subscribe', emptyPayloadSchema, () => {
      void socket.join(LOBBY_CHANNEL);
      return { ok: true, data: manager.listPublic() } as const;
    });
    route('lobby:unsubscribe', emptyPayloadSchema, () => {
      void socket.leave(LOBBY_CHANNEL);
      return { ok: true, data: null } as const;
    });
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
