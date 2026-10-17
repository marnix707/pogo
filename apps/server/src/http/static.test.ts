import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pogo-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Pogo</title>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"Pogo"}');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');

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
      webDistDir: dir,
      turnTimeSec: 0,
      disconnectGraceMs: 20_000,
      roomTtlMs: 600_000,
      guestSignupLimitPerMin: 1000,
      profanityFilter: true,
      botDelayMs: 1000,
    },
    users: createMemoryUserStore(),
    rng: createSeededRng(1),
    healthCheck: async () => {
      throw new Error('database down');
    },
  });
});

afterAll(async () => {
  await app.close();
  await app.app.close();
});

describe('production web serving', () => {
  it('serves index.html at / without caching', async () => {
    const res = await app.app.inject('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Pogo</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('caches fingerprinted assets forever', async () => {
    const res = await app.app.inject('/assets/app-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('serves the web app manifest with the right type', async () => {
    const res = await app.app.inject('/manifest.webmanifest');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('manifest+json');
    expect(res.json()).toEqual({ name: 'Pogo' });
  });

  it('serves the service worker as JavaScript that is never cached, so updates roll out', async () => {
    const res = await app.app.inject('/sw.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await app.app.inject('/room/ABCDE');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Pogo</title>');
  });

  it('keeps unknown API paths as JSON 404s', async () => {
    const res = await app.app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it('livez works even when the database is down, healthz does not', async () => {
    expect((await app.app.inject('/api/livez')).statusCode).toBe(200);
    expect((await app.app.inject('/api/healthz')).statusCode).toBe(500);
  });
});
