import { getSettings } from './settings';

export type SoundName = 'tap' | 'roll' | 'score' | 'turn' | 'win' | 'error';

let ctx: AudioContext | undefined;

function audio(): AudioContext | undefined {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return undefined;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
}

/** True while the browser still refuses sound (nothing has been tapped yet); false when it is muted anyway. */
export function audioLocked(): boolean {
  if (!getSettings().sound) return false;
  const c = audio();
  return !!c && c.state !== 'running';
}

/** Browsers only allow audio after a user gesture: call from the first tap. */
export function unlockAudio() {
  audio();
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.12,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Tiny synthesized sound effects: no audio files to download. */
export function play(name: SoundName) {
  if (!getSettings().sound) return;
  const c = audio();
  if (!c) return;
  switch (name) {
    case 'tap':
      tone(c, 520, 0, 0.06, 'triangle', 0.08);
      break;
    case 'roll':
      for (let i = 0; i < 7; i++)
        tone(c, 140 + Math.random() * 160, i * 0.055, 0.05, 'square', 0.05);
      break;
    case 'score':
      tone(c, 523, 0, 0.12, 'triangle');
      tone(c, 784, 0.1, 0.2, 'triangle');
      break;
    case 'turn':
      tone(c, 660, 0, 0.1, 'sine');
      tone(c, 880, 0.12, 0.16, 'sine');
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.12, 0.25, 'triangle', 0.14));
      break;
    case 'error':
      tone(c, 200, 0, 0.18, 'sawtooth', 0.07);
      break;
  }
}
