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
  WEB_DIST_DIR: z.string().optional(),
  TURN_TIME_SEC: z.coerce.number().int().min(0).default(90),
  DISCONNECT_GRACE_SEC: z.coerce.number().int().min(1).default(20),
  ROOM_TTL_SEC: z.coerce.number().int().min(1).default(600),
  GUEST_SIGNUP_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  PROFANITY_FILTER: z.enum(['on', 'off']).default('on'),
  BOT_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  MAIL_MODE: z.enum(['log', 'smtp']).default('log'),
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('POGO <no-reply@pogo.local>'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
  port: number;
  webPort: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[] | true;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  lanIps: string[];
  /** Built web app to serve (production). Unset in dev, where Vite serves the web app. */
  webDistDir?: string;
  /** Default seconds per turn action in new rooms (0 = no timer). */
  turnTimeSec: number;
  /** How long a disconnected player is waited for before being auto-skipped / dropped from a lobby. */
  disconnectGraceMs: number;
  /** How long a room with nobody connected is kept before being deleted. */
  roomTtlMs: number;
  /** Guest signups allowed per IP per minute. */
  guestSignupLimitPerMin: number;
  /** Mask profanity in chat and refuse profane guest nicknames. */
  profanityFilter: boolean;
  /** How long a computer player "thinks" before each move. */
  botDelayMs: number;
  /** `log` prints emailed codes to the server log (dev); `smtp` sends them through `smtpUrl`. */
  mailMode: 'log' | 'smtp';
  smtpUrl: string;
  mailFrom: string;
}

const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = schema.parse(source);
  const origins = list(env.CORS_ORIGINS);
  return {
    nodeEnv: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    port: env.SERVER_PORT,
    webPort: env.WEB_PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    corsOrigins: origins.includes('*') ? true : origins,
    logLevel: env.LOG_LEVEL,
    lanIps: list(env.HOST_LAN_IPS),
    webDistDir: env.WEB_DIST_DIR || undefined,
    turnTimeSec: env.TURN_TIME_SEC,
    disconnectGraceMs: env.DISCONNECT_GRACE_SEC * 1000,
    roomTtlMs: env.ROOM_TTL_SEC * 1000,
    guestSignupLimitPerMin: env.GUEST_SIGNUP_LIMIT_PER_MIN,
    profanityFilter: env.PROFANITY_FILTER === 'on',
    botDelayMs: env.BOT_DELAY_MS,
    mailMode: env.MAIL_MODE,
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM,
  };
}
