import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNKNOWN_ERROR_CODE, createSeededRng, errorCodeFor } from '@pogo/shared';
import { buildApp } from './app';
import { createMemoryUserStore } from './auth/userStore';
import { mailFailure } from './errors';
import type { Mailer } from './mail/mailer';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe('every known error message has a code', () => {
  // Messages written as string literals after `error:`, `fail(` and `err(` in the server and the
  // shared game logic. (Messages with a name or number inside are covered by patterns, see the
  // shared errors.test.ts.)
  const root = join(__dirname, '..', '..', '..');
  const files = [
    ...sources(join(root, 'apps/server/src')),
    ...sources(join(root, 'packages/shared/src')),
  ];
  const messages = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:error:|fail\(|err\()\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const message = m[2]!.replace(/\\'/g, "'");
      if (!message.includes('${')) messages.add(message);
    }
  }

  it('finds the messages in the source (so the scan itself works)', () => {
    expect(messages.size).toBeGreaterThan(60);
    expect(messages.has('Room not found')).toBe(true);
  });

  it('has a catalogue entry for each one', () => {
    const missing = [...messages].filter((m) => errorCodeFor(m) === UNKNOWN_ERROR_CODE);
    expect(missing).toEqual([]);
  });
});

describe('mail failures get a code that says what went wrong', () => {
  const code = (err: unknown) => mailFailure(err).code;
  it('maps the provider answer and network problems', () => {
    expect(code(new Error('Brevo 401: {"message":"Key not found"}'))).toBe('MAIL-002');
    expect(code(new Error('Brevo 403: forbidden'))).toBe('MAIL-002');
    expect(code(new Error('Brevo 400: sender not valid'))).toBe('MAIL-003');
    expect(code(new Error('Brevo 429: slow down'))).toBe('MAIL-006');
    expect(code(new Error('Brevo 503: down'))).toBe('MAIL-001');
    expect(code(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))).toBe('MAIL-002');
    expect(code(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe('MAIL-004');
    expect(code(new Error('The operation was aborted due to timeout'))).toBe('MAIL-004');
    expect(code(new Error('something else'))).toBe('MAIL-001');
    expect(mailFailure(new Error('x')).statusCode).toBe(502);
  });
});

describe('API errors carry a code (and a ref for server errors)', () => {
  const config = {
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
    profanityFilter: false,
    botDelayMs: 1000,
    mailMode: 'log' as const,
    brevoApiKey: '',
    publicBaseUrl: '',
    smtpUrl: '',
    mailFrom: 'test',
  };
  const failing: Mailer = {
    send: async () => {
      throw new Error('Brevo 401: {"message":"Key not found","code":"unauthorized"}');
    },
  };
  let server: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    server = await buildApp({
      config,
      users: createMemoryUserStore(),
      rng: createSeededRng(1),
      healthCheck: async () => {
        throw new Error('database is down');
      },
      mailer: failing,
    });
  });
  afterAll(async () => {
    await server.close();
    await server.app.close();
  });

  it('known errors get their code from the catalogue', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'Not signed in', code: 'ACC-101' });
  });

  it('a mail that cannot be sent is a 502 with a MAIL code, a friendly text and a ref', async () => {
    const guest = (
      await server.app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { nickname: 'Mailtest', avatar: 'fox' },
      })
    ).json() as { token: string };
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/account/register/start',
      headers: { authorization: `Bearer ${guest.token}` },
      payload: { email: 'someone@example.com' },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json() as { error: string; code: string; ref: string };
    expect(body.code).toBe('MAIL-002');
    expect(body.error).toBe("We couldn't send the email. Please try again in a minute.");
    expect(body.ref).toBeTruthy();
  });

  it('anything unexpected is SYS-500 with a ref, never the raw error', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/healthz' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: string; code: string; ref: string };
    expect(body).toMatchObject({ error: 'Something went wrong on our side', code: 'SYS-500' });
    expect(body.ref).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('database is down');
  });
});
