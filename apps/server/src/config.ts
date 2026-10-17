import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_PORT: z.coerce.number().int().default(3000),
  WEB_PORT: z.coerce.number().int().default(5173),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HOST_LAN_IPS: z.string().default(''),
});

const env = schema.parse(process.env);

const origins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.SERVER_PORT,
  webPort: env.WEB_PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: origins.includes('*') ? true : origins,
  logLevel: env.LOG_LEVEL,
  lanIps: env.HOST_LAN_IPS.split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
} as const;
