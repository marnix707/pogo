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
  DISCONNECT_GRACE_SEC: z.coerce.number().int().min(1).default(20),
  ROOM_TTL_SEC: z.coerce.number().int().min(1).default(600),
  GUEST_SIGNUP_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  PROFANITY_FILTER: z.enum(['on', 'off']).default('on'),
  BOT_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  MAIL_MODE: z.enum(['log', 'smtp', 'brevo']).default('log'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  /** Optional all-in-one alternative to the four above (e.g. smtps://user:pass@host:465); wins when set. */
  SMTP_URL: z.string().default(''),
  /** API key for `MAIL_MODE=brevo` (Brevo's HTTPS API; hosts such as Render block outgoing SMTP). */
  // (A key pasted with spaces, a newline or quotes around it still works.)
  BREVO_API_KEY: z
    .string()
    .default('')
    .transform((key) =>
      key
        .trim()
        .replace(/^["']+|["']+$/g, '')
        .trim(),
    ),
  /** Public address of the site (no trailing slash); the mail artwork is loaded from it in brevo mode. */
  PUBLIC_BASE_URL: z.string().default(''),
  MAIL_FROM: z.string().default('POGO <no-reply@pogo.local>'),
  /** Comma separated emails that become admin when they register or log in. */
  ADMIN_EMAILS: z.string().default(''),
  DEV_EMAILS: z.string().default(''),
});

/**
 * The SMTP connection string for nodemailer, built from the separate `SMTP_*` settings (user and
 * password are URL-encoded here, so they can hold any character). Port 465 is implicit TLS
 * (`smtps`); other ports start plain and upgrade with STARTTLS.
 */
export function smtpUrlFrom(env: {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_URL: string;
}): string {
  if (env.SMTP_URL) return env.SMTP_URL;
  if (!env.SMTP_HOST) return '';
  const auth = env.SMTP_USER
    ? `${encodeURIComponent(env.SMTP_USER)}:${encodeURIComponent(env.SMTP_PASSWORD)}@`
    : '';
  return `${env.SMTP_PORT === 465 ? 'smtps' : 'smtp'}://${auth}${env.SMTP_HOST}:${env.SMTP_PORT}`;
}

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
  /** Default seconds per turn action in new rooms: always 0 (Off) in the real app. */
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
  /** `log` prints emailed codes to the server log (dev); `smtp` sends them through `smtpUrl`, `brevo` through Brevo's HTTPS API. */
  mailMode: 'log' | 'smtp' | 'brevo';
  brevoApiKey: string;
  publicBaseUrl: string;
  smtpUrl: string;
  mailFrom: string;
  /** Lowercase emails that become admin on register/login (optional in tests). */
  adminEmails?: string[];
  devEmails?: string[];
}

const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = schema.parse(source);
  if (env.MAIL_MODE === 'smtp' && !smtpUrlFrom(env))
    throw new Error('MAIL_MODE=smtp needs SMTP_HOST (plus SMTP_PORT, SMTP_USER, SMTP_PASSWORD)');
  if (env.MAIL_MODE === 'brevo' && !env.BREVO_API_KEY)
    throw new Error('MAIL_MODE=brevo needs BREVO_API_KEY');
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
    // Every new room starts with the turn timer Off, for every game (not an environment setting; tests inject their own).
    turnTimeSec: 0,
    disconnectGraceMs: env.DISCONNECT_GRACE_SEC * 1000,
    roomTtlMs: env.ROOM_TTL_SEC * 1000,
    guestSignupLimitPerMin: env.GUEST_SIGNUP_LIMIT_PER_MIN,
    profanityFilter: env.PROFANITY_FILTER === 'on',
    botDelayMs: env.BOT_DELAY_MS,
    mailMode: env.MAIL_MODE,
    brevoApiKey: env.BREVO_API_KEY,
    publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
    smtpUrl: smtpUrlFrom(env),
    mailFrom: env.MAIL_FROM,
    adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
    devEmails: list(env.DEV_EMAILS).map((e) => e.toLowerCase()),
  };
}
