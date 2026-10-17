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
import { RoomManager } from './rooms/RoomManager';
import { registerSocketHandlers, userChannel } from './socket/handlers';
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
  const app = Fastify({ logger: deps.logger ?? false });

  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const tokens = createTokenService(config.jwtSecret);

  app.get('/api/healthz', async () => {
    await deps.healthCheck();
    return { ok: true, app: APP_NAME };
  });
  registerAuthRoutes(app, deps.users, tokens);

  // Socket.IO shares Fastify's HTTP server (must be attached before listen).
  const io: PogoServer = new Server(app.server, { cors: { origin: config.corsOrigins } });

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
  });

  registerSocketHandlers({ io, manager, users: deps.users, tokens, log: app.log });

  return {
    app,
    io,
    manager,
    async close() {
      await io.close();
    },
  };
}
