import { APP_NAME } from '@pogo/shared';
import { buildApp } from './app';
import { createPrismaModerationStore } from './admin/moderation';
import { createPrismaUserStore } from './auth/userStore';
import { loadConfig } from './config';
import { prisma } from './db';
import { cryptoRng } from './rng';

async function main() {
  const config = loadConfig();

  const { app, close } = await buildApp({
    config,
    users: createPrismaUserStore(prisma),
    moderation: createPrismaModerationStore(prisma),
    rng: cryptoRng,
    healthCheck: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    logger: {
      level: config.logLevel,
      ...(config.isProd
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }),
    },
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: config.port });

  if (config.isProd) {
    app.log.info(`${APP_NAME} is up`);
    return;
  }
  const urls = ['localhost', ...config.lanIps].map((h) => `  http://${h}:${config.webPort}`);
  app.log.info(
    `${APP_NAME} is up. Open on this machine or on your phone (same Wi-Fi):\n${urls.join('\n')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
