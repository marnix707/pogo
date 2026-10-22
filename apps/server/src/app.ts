import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import {
  APP_NAME,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  errorCodeFor,
  getGame,
  maskProfanity,
} from '@pogo/shared';
import type { AnyGameDefinition, Rng } from '@pogo/shared';
import type { AppConfig } from './config';
import { BanList, banMessage, createMemoryModerationStore } from './admin/moderation';
import type { ModerationStore } from './admin/moderation';
import { createTokenService } from './auth/tokens';
import { AppError } from './errors';
import type { UserStore } from './auth/userStore';
import { registerAccountRoutes } from './http/accountRoutes';
import { registerAdminRoutes } from './http/adminRoutes';
import { registerAuthRoutes } from './http/authRoutes';
import { createBrevoMailer, createLogMailer, createSmtpMailer } from './mail/mailer';
import type { Mailer } from './mail/mailer';
import { recordFinishedGame } from './stats/record';
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
  /** How long computer players think before moving. */
  botMs?: number;
  /** Countdown between everybody ready and the game starting (default 3s; tests shorten it). */
  startCountdownMs?: number;
  /** Sends the emailed codes. Default: from `config.mailMode` (log in dev, SMTP in production). */
  mailer?: Mailer;
  /** Bans and the staff log. Default: in memory (tests). */
  moderation?: ModerationStore;
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
  const moderation = deps.moderation ?? createMemoryModerationStore();
  const bans = new BanList(moderation);
  await bans.load();

  // A banned account is shut out of the whole API with its token (IP bans are checked where a
  // person arrives: guest signup, login and the socket handshake).
  app.addHook('onRequest', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ') || !req.url.startsWith('/api/')) return;
    const userId = await tokens.verify(header.slice(7));
    const ban = userId ? bans.forUser(userId) : null;
    if (ban) return reply.code(403).send({ error: banMessage(ban), banned: true });
  });

  // Every error body gets its code (the text stays as it is); see shared errors.ts.
  app.addHook('preSerialization', async (_req, _reply, payload) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const body = payload as { error?: unknown; code?: unknown };
      if (typeof body.error === 'string' && body.code === undefined) {
        return { ...body, code: errorCodeFor(body.error) };
      }
    }
    return payload;
  });
  // Anything thrown: an AppError is reported as chosen, everything else is a server error (SYS-500).
  // The ref in the response is the request id in the log line, so a report can be traced.
  app.setErrorHandler((error: unknown, req, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (err instanceof AppError) {
      // (the real cause, e.g. "Brevo 401: Key not found", is in `cause`)
      const cause = err.cause instanceof Error ? err.cause.message : err.cause;
      req.log.error({ err, cause, code: err.code, ref: req.id }, `${err.code}: ${err.message}`);
      return reply.code(err.statusCode).send({ error: err.message, code: err.code, ref: req.id });
    }
    if (status >= 500) {
      req.log.error({ err, code: INTERNAL_ERROR_CODE, ref: req.id }, 'request failed');
      return reply
        .code(status)
        .send({ error: INTERNAL_ERROR_MESSAGE, code: INTERNAL_ERROR_CODE, ref: req.id });
    }
    // The rate limiter throws its own message (see errorResponseBuilder above).
    if (status === 429) {
      const message = 'Too many attempts. Please wait a minute and try again.';
      return reply.code(429).send({ error: message, code: errorCodeFor(message) });
    }
    // Other 4xx raised by Fastify itself (malformed JSON, payload too large, ...)
    return reply
      .code(status)
      .send({ error: 'Invalid request', code: errorCodeFor('Invalid request') });
  });

  // Liveness for the host's health probes: never touches the database (keeps Neon asleep).
  app.get('/api/livez', async () => ({ ok: true }));
  app.get('/api/healthz', async () => {
    await deps.healthCheck();
    return { ok: true, app: APP_NAME };
  });
  registerAuthRoutes(app, deps.users, tokens, {
    guestLimitPerMin: config.guestSignupLimitPerMin,
    rejectProfaneNicknames: config.profanityFilter,
    bans,
  });
  const logMailer = createLogMailer((line) => app.log.info(line));
  const useLog = !deps.mailer && config.mailMode === 'log';
  registerAccountRoutes(app, {
    users: deps.users,
    tokens,
    mailer:
      deps.mailer ??
      (useLog
        ? logMailer
        : config.mailMode === 'brevo'
          ? createBrevoMailer(
              config.brevoApiKey,
              config.mailFrom,
              config.publicBaseUrl && `${config.publicBaseUrl}/mail-hero.png`,
            )
          : createSmtpMailer(config.smtpUrl, config.mailFrom)),
    secret: config.jwtSecret,
    bans,
    moderation,
    adminEmails: config.adminEmails,
    devEmails: config.devEmails,
    limitScale: config.isProd ? 1 : 100,
    // Handy for tests and local development; never in production.
    devMailbox: useLog && !config.isProd ? logMailer : undefined,
  });
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
      botMs: deps.botMs ?? config.botDelayMs,
      startCountdownMs: deps.startCountdownMs,
    },
    defaultTurnTimeSec: config.turnTimeSec,
    maskText: config.profanityFilter ? maskProfanity : (text) => text,
    emitChat: (userId, message) => {
      io.to(userChannel(userId)).emit('chat:message', message);
    },
    emitHistory: (userId, messages) => {
      io.to(userChannel(userId)).emit('chat:history', messages);
    },
    onLobbyChanged: scheduleLobbyBroadcast,
    onGameFinished: (finished) => {
      recordFinishedGame(deps.users, finished).catch((err) =>
        app.log.error({ err }, 'could not record game results'),
      );
    },
  });

  registerSocketHandlers({
    io,
    manager,
    users: deps.users,
    tokens,
    bans,
    trustProxy: config.isProd,
    log: app.log,
  });
  registerAdminRoutes(app, {
    users: deps.users,
    tokens,
    bans,
    moderation,
    manager,
    disconnectUser: (userId) => io.in(userChannel(userId)).disconnectSockets(true),
    isOnline: (userId) => (io.sockets.adapter.rooms.get(userChannel(userId))?.size ?? 0) > 0,
  });

  // The first admin(s) from ADMIN_EMAILS get the role at start-up too (not only at their next login).
  for (const email of config.adminEmails ?? []) {
    const found = await deps.users.getByEmail(email);
    if (found && found.user.role !== 'admin') await deps.users.setRole(found.user.id, 'admin');
  }
  // DEV_EMAILS accounts are developers (admin + the rainbow dev tag) on every start-up.
  for (const email of config.devEmails ?? []) {
    const found = await deps.users.getByEmail(email);
    if (!found) continue;
    if (found.user.role !== 'admin') await deps.users.setRole(found.user.id, 'admin');
    if (!found.user.isDev) await deps.users.setDev(found.user.id, true);
  }

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
