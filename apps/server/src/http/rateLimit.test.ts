import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({
    config: {
      nodeEnv: 'test',
      isProd: false,
      port: 0,
      webPort: 5173,
      databaseUrl: '',
      jwtSecret: 'test-secret-test-secret-test-secret',
      corsOrigins: true,
      logLevel: 'error',
      lanIps: [],
      turnTimeSec: 0,
      disconnectGraceMs: 20_000,
      roomTtlMs: 600_000,
      guestSignupLimitPerMin: 2,
      profanityFilter: true,
      botDelayMs: 1000,
      mailMode: 'log' as const,
      smtpUrl: '',
      mailFrom: 'test',
    },
    users: createMemoryUserStore(),
    rng: createSeededRng(1),
    healthCheck: async () => {},
  });
});

afterAll(async () => {
  await app.close();
  await app.app.close();
});

describe('guest signup rate limit', () => {
  const signup = () =>
    app.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Rate', avatar: 'fox' },
    });

  it('allows the configured number per minute, then answers in plain language', async () => {
    expect((await signup()).statusCode).toBe(201);
    expect((await signup()).statusCode).toBe(201);
    const blocked = await signup();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe('Too many attempts. Please wait a minute and try again.');
  });
});
