import { getSettings } from './settings';

export type SoundName =
  'tap' | 'roll' | 'score' | 'turn' | 'win' | 'error' | 'gun' | 'crunch' | 'deal';

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

/** A burst of filtered noise that dies away quickly (the crack of a shot). */
function noise(c: AudioContext, start: number, duration: number, volume: number, highpass: number) {
  const frames = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const gain = c.createGain();
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

/** A tone that slides from one pitch to another. */
function sweep(
  c: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  start: number,
  duration: number,
  volume: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + start;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
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
    case 'crunch':
      // Three quick bites: short bursts of low-passed noise with a little pitched thud under each.
      [0, 0.1, 0.2].forEach((t, i) => {
        noise(c, t, 0.07, 0.5, 400 + i * 150);
        sweep(c, 'triangle', 260 - i * 40, 90, t, 0.08, 0.18);
      });
      break;
    case 'deal':
      // A card slid across the table: a soft swish and a tick.
      noise(c, 0, 0.12, 0.18, 2500);
      tone(c, 700, 0.1, 0.05, 'triangle', 0.06);
      break;
    case 'gun':
      // A pistol shot: the crack, the thump and a short "pew" that slides down.
      noise(c, 0, 0.22, 0.45, 900);
      sweep(c, 'sine', 240, 40, 0, 0.18, 0.4);
      sweep(c, 'square', 1700, 240, 0.005, 0.16, 0.07);
      break;
  }
}
