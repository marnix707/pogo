import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';
import { forwardedClientIp } from '../clientIp';
import { loadConfig } from '../config';
import type { AppConfig } from '../config';

const baseConfig: AppConfig = {
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
  guestSignupLimitPerMin: 1000,
  profanityFilter: false,
  botDelayMs: 1000,
  mailMode: 'log',
  brevoApiKey: '',
  publicBaseUrl: '',
  smtpUrl: '',
  mailFrom: 'test',
};

const start = (config: Partial<AppConfig>) =>
  buildApp({
    config: { ...baseConfig, ...config },
    users: createMemoryUserStore(),
    rng: createSeededRng(1),
    healthCheck: async () => {},
  });

describe('client address behind proxies', () => {
  it('ignores entries a client put in front when the number of proxies is known', () => {
    // The client sent "6.6.6.6"; our proxy appended the address it really saw.
    expect(forwardedClientIp('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(forwardedClientIp('6.6.6.6, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
    expect(forwardedClientIp(['6.6.6.6', '203.0.113.9'], 1)).toBe('203.0.113.9');
    expect(forwardedClientIp('203.0.113.9', 3)).toBe('203.0.113.9');
    expect(forwardedClientIp(undefined, 1)).toBeNull();
  });
  it('without a number it trusts the leftmost entry (the old behaviour)', () => {
    expect(forwardedClientIp('6.6.6.6, 203.0.113.9', undefined)).toBe('6.6.6.6');
  });

  it('a forged X-Forwarded-For cannot pick the rate-limit address in production', async () => {
    const s = await start({ isProd: true, trustProxyHops: 1 });
    try {
      const ip = async (xff: string) => {
        s.app.get('/__ip', async (req) => ({ ip: req.ip }));
        return (
          await s.app.inject({ method: 'GET', url: '/__ip', headers: { 'x-forwarded-for': xff } })
        ).json().ip;
      };
      // inject() has no socket peer; the only proxy hop is the last entry.
      expect(await ip('6.6.6.6, 203.0.113.9')).toBe('203.0.113.9');
    } finally {
      await s.close();
      await s.app.close();
    }
  });
});

describe('security headers', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pogo-sec-'));
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><title>x</title><script>var a = 1;</script><script type="module" src="/a.js"></script>',
    );
  });

  it('every answer is unframeable, nosniff and sends no referrer; production adds CSP + HSTS', async () => {
    const s = await start({ isProd: true, webDistDir: dir });
    try {
      const api = await s.app.inject({ method: 'GET', url: '/api/livez' });
      expect(api.headers['x-frame-options']).toBe('DENY');
      expect(api.headers['x-content-type-options']).toBe('nosniff');
      expect(api.headers['referrer-policy']).toBe('no-referrer');
      expect(api.headers['strict-transport-security']).toBeTruthy();
      const page = await s.app.inject({ method: 'GET', url: '/' });
      const csp = String(page.headers['content-security-policy']);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    } finally {
      await s.close();
      await s.app.close();
    }
  });

  it('serves no file outside the web folder', async () => {
    const s = await start({ webDistDir: dir });
    try {
      for (const url of ['/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%5c..%5c.env']) {
        const res = await s.app.inject({ method: 'GET', url });
        expect(res.body).not.toContain('root:');
        // Refused (4xx) or just the app's own page: never a file from outside.
        expect(res.statusCode >= 400 || res.body.includes('<title>x</title>')).toBe(true);
      }
    } finally {
      await s.close();
      await s.app.close();
    }
  });
});

describe('dev mailbox', () => {
  it('is off when DEV_MAILBOX is 0 and never exists in production', async () => {
    for (const config of [{ devMailbox: false }, { isProd: true, devMailbox: true }]) {
      const s = await start(config);
      try {
        expect(
          (await s.app.inject({ method: 'GET', url: '/api/dev/last-mail?to=a@b.nl' })).statusCode,
        ).toBe(404);
      } finally {
        await s.close();
        await s.app.close();
      }
    }
  });
});

describe('production config', () => {
  const required = { DATABASE_URL: 'postgresql://x', NODE_ENV: 'production' };
  it('refuses the public development JWT secret', () => {
    expect(() =>
      loadConfig({
        ...required,
        JWT_SECRET: 'dev-only-change-me-dev-only-change-me',
      } as NodeJS.ProcessEnv),
    ).toThrow(/placeholder/);
    expect(() =>
      loadConfig({
        ...required,
        JWT_SECRET: 'q8Zr0kLw3VxN7bYtP1sDfGhJ4mCuA9eX',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe('account brute force', () => {
  it('limits codes per address and locks logging in after many wrong passwords', async () => {
    const s = await start({});
    const call = (url: string, payload: unknown, token?: string) =>
      s.app.inject({
        method: 'POST',
        url,
        payload: payload as object,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    try {
      const g = (await call('/api/auth/guest', { nickname: 'Mallory', avatar: 'fox' })).json() as {
        token: string;
      };
      const email = 'victim@example.com';
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await call('/api/account/register/start', { email }, g.token)).statusCode);
      }
      expect(statuses).toEqual([200, 200, 200, 429, 429]);

      let last = 0;
      for (let i = 0; i < 11; i++) {
        last = (await call('/api/auth/login', { email, password: 'wrong-wrong' })).statusCode;
      }
      expect(last).toBe(429);
    } finally {
      await s.close();
      await s.app.close();
    }
  });
});
