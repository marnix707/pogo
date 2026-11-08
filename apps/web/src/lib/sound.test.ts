import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in AudioContext that counts what the app asks of the audio hardware. */
let made: FakeContext[] = [];
class FakeContext {
  state = 'suspended';
  destination = {};
  currentTime = 0;
  constructor() {
    made.push(this);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect(to: unknown) {
        return to;
      },
    };
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0, setValueAtTime() {} },
      connect(to: unknown) {
        return to;
      },
      start() {},
      stop() {},
    };
  }
}

describe('audio is only held while something can be heard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    made = [];
    vi.resetModules();
    const g = globalThis as unknown as { window: unknown; AudioContext: unknown };
    g.window = { AudioContext: FakeContext, addEventListener() {} };
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: { classList: { toggle() {} }, style: { setProperty() {} } },
      addEventListener() {},
    };
  });
  afterEach(() => vi.useRealTimers());

  it('with sound and music at 0 no audio engine is started', async () => {
    const { updateSettings } = await import('./settings');
    updateSettings({ sound: 0, music: 0 });
    const { play, getAudioContext, unlockAudio } = await import('./sound');
    unlockAudio();
    play('tap');
    expect(getAudioContext()).toBeUndefined();
    expect(made).toHaveLength(0);
  });

  it('music at 0: the engine is not given to the music, and a sound effect puts it to rest again', async () => {
    const { updateSettings } = await import('./settings');
    updateSettings({ sound: 100, music: 0 });
    const { play, getAudioContext } = await import('./sound');
    expect(getAudioContext()).toBeUndefined();
    play('tap');
    expect(made[0]?.state).toBe('running');
    await vi.advanceTimersByTimeAsync(1500);
    expect(made[0]?.state).toBe('suspended');
  });

  it('turning both to 0 lets the engine go', async () => {
    const { updateSettings } = await import('./settings');
    updateSettings({ sound: 100, music: 50 });
    const { getAudioContext } = await import('./sound');
    expect(getAudioContext()).toBeDefined();
    updateSettings({ sound: 0, music: 0 });
    expect(made[0]?.state).toBe('closed');
  });
});
