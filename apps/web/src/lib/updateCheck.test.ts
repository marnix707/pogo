import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServedBuild, isOutdated } from './updateCheck';

afterEach(() => vi.unstubAllGlobals());

describe('update check', () => {
  it('is outdated only when the server names a different build', () => {
    expect(isOutdated('a1', 'a1')).toBe(false);
    expect(isOutdated('a1', 'b2')).toBe(true);
    expect(isOutdated('a1', null)).toBe(false);
    expect(isOutdated('a1', '')).toBe(false);
    expect(isOutdated('a1', undefined)).toBe(false);
  });

  it('reads the build id from version.json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ build: 'xyz' }) })),
    );
    expect(await fetchServedBuild()).toBe('xyz');
  });

  it('ignores failures, HTML fallbacks and garbage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await fetchServedBuild()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    expect(await fetchServedBuild()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error('<html>');
        },
      })),
    );
    expect(await fetchServedBuild()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ build: 5 }) })),
    );
    expect(await fetchServedBuild()).toBeNull();
  });
});
