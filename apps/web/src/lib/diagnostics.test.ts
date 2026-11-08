import { describe, expect, it } from 'vitest';
import {
  collectExtras,
  recentErrors,
  recordError,
  registerDiagnostics,
  scrub,
} from './diagnostics';

describe('bug report diagnostics', () => {
  it('removes anything that looks like a secret, at any depth', () => {
    const out = scrub({
      screen: 'game',
      token: 'abc',
      user: { nickname: 'Fox', authToken: 'x', password: 'y' },
      list: [{ cookie: 'c', ok: 1 }],
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/abc|"x"|"y"|"c"/);
    expect(out.screen).toBe('game');
    expect((out.user as Record<string, unknown>).nickname).toBe('Fox');
  });
  it('keeps the last 20 errors only', () => {
    for (let i = 0; i < 25; i++) recordError('console', `boom ${i}`, i);
    const errs = recentErrors();
    expect(errs).toHaveLength(20);
    expect(errs[0]!.message).toBe('boom 5');
  });
  it('collects what screens register, and a broken reader never breaks the report', () => {
    const off = registerDiagnostics('x', () => ({ a: 1 }));
    registerDiagnostics('bad', () => {
      throw new Error('nope');
    });
    const extras = collectExtras();
    expect(extras.x).toEqual({ a: 1 });
    expect(String(extras.bad)).toContain('could not read');
    off();
    expect(collectExtras().x).toBeUndefined();
  });
});
