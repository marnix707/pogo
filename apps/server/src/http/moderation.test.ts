import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';

const config = (profanityFilter: boolean) => ({
  nodeEnv: 'test' as const,
  isProd: false,
  port: 0,
  webPort: 5173,
  databaseUrl: '',
  jwtSecret: 'test-secret-test-secret-test-secret',
  corsOrigins: true as const,
  logLevel: 'error' as const,
  lanIps: [],
  turnTimeSec: 0,
  disconnectGraceMs: 20_000,
  roomTtlMs: 600_000,
  guestSignupLimitPerMin: 1000,
  profanityFilter,
  botDelayMs: 1000,
  mailMode: 'log' as const,
  brevoApiKey: '',
  publicBaseUrl: '',
  smtpUrl: '',
  mailFrom: 'test',
});

const build = (profanityFilter: boolean) =>
  buildApp({
    config: config(profanityFilter),
    users: createMemoryUserStore(),
    rng: createSeededRng(1),
    healthCheck: async () => {},
  });

let on: Awaited<ReturnType<typeof build>>;
let off: Awaited<ReturnType<typeof build>>;

beforeAll(async () => {
  on = await build(true);
  off = await build(false);
});
afterAll(async () => {
  for (const a of [on, off]) {
    await a.close();
    await a.app.close();
  }
});

const signup = (app: typeof on, nickname: string) =>
  app.app.inject({ method: 'POST', url: '/api/auth/guest', payload: { nickname, avatar: 'fox' } });

describe('PROFANITY_FILTER switch for nicknames', () => {
  it('refuses profane nicknames when on', async () => {
    const res = await signup(on, 'Big Sh1t');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Please pick a different nickname');
  });

  it('allows them when off', async () => {
    const res = await signup(off, 'Big Sh1t');
    expect(res.statusCode).toBe(201);
  });

  it('allows ordinary nicknames either way', async () => {
    expect((await signup(on, 'Friendly')).statusCode).toBe(201);
    expect((await signup(off, 'Friendly')).statusCode).toBe(201);
  });
});
