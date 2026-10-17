import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { APP_NAME, getGame } from '@pogo/shared';
import type { AnyGameDefinition, Rng } from '@pogo/shared';
import type { AppConfig } from './config';
import { createTokenService } from './auth/tokens';
import type { UserStore } from './auth/userStore';
import { registerAuthRoutes } from './http/authRoutes';
import { registerStatic } from './http/static';
import { RoomManager } from './rooms/RoomManager';
import { LOBBY_CHANNEL, registerSocketHandlers, userChannel } from './socket/handlers';
import type { PogoServer } from './socket/handlers';

export interface AppDeps {
  config: AppConfig;
  users: UserStore;
  rng: Rng;
  /** Throws if a dependency (the database) is unreachable. */
  healthCheck: () => Promise<void>;
  getGame?: (id: string) => AnyGameDefinition | undefined;
  autoStepMs?: number;
  logger?: boolean | object;
}

export async function buildApp(deps: AppDeps) {
  const { config } = deps;
  // Behind Render's proxy the real client IP is in X-Forwarded-For; without this every user
  // would share one rate-limit bucket.
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: config.isProd });

  await app.register(cors, { origin: config.corsOrigins });
  // Only the API is rate limited; static assets are not.
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api'),
    // Shown to players as-is by the web app, so keep it human.
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too many attempts. Please wait a minute and try again.',
    }),
  });

  const tokens = createTokenService(config.jwtSecret);

  // Liveness for the host's health probes: never touches the database (keeps Neon asleep).
  app.get('/api/livez', async () => ({ ok: true }));
  app.get('/api/healthz', async () => {
    await deps.healthCheck();
    return { ok: true, app: APP_NAME };
  });
  registerAuthRoutes(app, deps.users, tokens, config.guestSignupLimitPerMin);
  if (config.webDistDir) await registerStatic(app, config.webDistDir);

  // Socket.IO shares Fastify's HTTP server (must be attached before listen).
  const io: PogoServer = new Server(app.server, { cors: { origin: config.corsOrigins } });

  // Push the public room list to subscribers when it changes (debounced, and only if it differs).
  let lobbyTimer: ReturnType<typeof setTimeout> | undefined;
  let lastLobbyJson = '';
  const scheduleLobbyBroadcast = () => {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = undefined;
      const list = manager.listPublic();
      const json = JSON.stringify(list);
      if (json === lastLobbyJson) return;
      lastLobbyJson = json;
      io.to(LOBBY_CHANNEL).emit('lobby:list', list);
    }, 150);
  };

  const manager = new RoomManager({
    getGame: deps.getGame ?? getGame,
    rng: deps.rng,
    emit: (userId, room, reason) => {
      io.to(userChannel(userId)).emit('room:state', room, reason);
    },
    limits: {
      graceMs: config.disconnectGraceMs,
      emptyTtlMs: config.roomTtlMs,
      autoStepMs: deps.autoStepMs ?? 1200,
    },
    defaultTurnTimeSec: config.turnTimeSec,
    emitChat: (userId, message) => {
      io.to(userChannel(userId)).emit('chat:message', message);
    },
    emitHistory: (userId, messages) => {
      io.to(userChannel(userId)).emit('chat:history', messages);
    },
    onLobbyChanged: scheduleLobbyBroadcast,
  });

  registerSocketHandlers({ io, manager, users: deps.users, tokens, log: app.log });

  return {
    app,
    io,
    manager,
    async close() {
      clearTimeout(lobbyTimer);
      await io.close();
    },
  };
}
