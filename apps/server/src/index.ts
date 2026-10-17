import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { APP_NAME } from '@pogo/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@pogo/shared';
import { config } from './config';
import { prisma } from './db';

async function main() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isProd
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }),
    },
  });

  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/api/healthz', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, app: APP_NAME };
  });

  // Socket.IO shares Fastify's underlying HTTP server (must be attached before listen).
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: config.corsOrigins },
  });

  io.on('connection', (socket) => {
    app.log.info({ socketId: socket.id }, 'socket connected');
    socket.emit('hello', { message: `Welcome to ${APP_NAME}`, serverTime: Date.now() });
    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await io.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: config.port });

  const urls = ['localhost', ...config.lanIps].map((h) => `  http://${h}:${config.webPort}`);
  app.log.info(
    `${APP_NAME} is up. Open on this machine or on your phone (same Wi-Fi):\n${urls.join('\n')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
