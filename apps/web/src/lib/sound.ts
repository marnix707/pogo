import { getSettings } from './settings';

export type SoundName =
  | 'tap'
  | 'roll'
  | 'score'
  | 'turn'
  | 'win'
  | 'error'
  | 'gun'
  | 'crunch'
  | 'deal'
  | 'hurry'
  | 'whistle'
  | 'boom'
  | 'splash'
  | 'ping'
  | 'sink'
  | 'shield'
  | 'ghost'
  | 'skull'
  | 'bell';

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

/** One tick of a counter that races up (a casino-style count): `step` raises the pitch a little. */
export function tick(step: number) {
  if (!getSettings().sound) return;
  const c = audio();
  if (!c) return;
  tone(c, 620 + Math.min(step, 24) * 38, 0, 0.035, 'square', 0.035);
}

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1568, 1760];

/**
 * A match clearing: a soft pop for the first one, then every link of a chain reaction climbs higher
 * with a longer run of coin-like notes, a clink, and a bell "ka-ching" from the third link on.
 */
export function chainSound(level: number) {
  if (!getSettings().sound) return;
  const c = audio();
  if (!c) return;
  const top = PENTATONIC.length - 1;
  tone(c, PENTATONIC[Math.min(level, top)] as number, 0, 0.14, 'triangle', 0.12);
  noise(c, 0, 0.06, 0.18, 1800);
  if (level < 1) return;
  const notes = Math.min(3 + level, 8);
  for (let i = 0; i < notes; i++) {
    const f = PENTATONIC[Math.min(i + level - 1, top)] as number;
    tone(c, f, 0.04 + i * 0.05, 0.12, 'square', 0.04);
    tone(c, f * 2, 0.04 + i * 0.05, 0.1, 'sine', 0.05);
  }
  noise(c, 0.05, 0.1, 0.16, 6000);
  if (level >= 2) {
    tone(c, 1568, 0.05 + notes * 0.05, 0.4, 'sine', 0.1);
    tone(c, 2093, 0.1 + notes * 0.05, 0.6, 'sine', 0.09);
  }
}

/** Tiny synthesized sound effects: no audio files to download.*/
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
    case 'bell':
      // "Ring the bell!": a loud, silly ding-a-ling (brass partials, a quick two-tone warble), then a wah-wah.
      for (let i = 0; i < 10; i++) {
        const f = i % 2 ? 1568 : 1397;
        const t0 = i * 0.085;
        tone(c, f, t0, 0.2, 'triangle', 0.22);
        tone(c, f * 2.76, t0, 0.14, 'sine', 0.1);
        tone(c, f * 5.4, t0, 0.07, 'sine', 0.05);
      }
      [659, 622, 587, 554].forEach((f, i) => tone(c, f, 0.95 + i * 0.12, 0.16, 'sawtooth', 0.07));
      sweep(c, 'sine', 300, 120, 1.45, 0.25, 0.1);
      break;
    case 'whistle':
      // A bomb falling: a pitch that drops.
      sweep(c, 'sine', 1100, 260, 0, 0.34, 0.07);
      break;
    case 'boom':
      sweep(c, 'sawtooth', 180, 40, 0, 0.5, 0.16);
      for (let i = 0; i < 6; i++) tone(c, 90 + Math.random() * 120, i * 0.05, 0.08, 'square', 0.06);
      break;
    case 'splash':
      for (let i = 0; i < 5; i++)
        tone(c, 700 + Math.random() * 500, i * 0.035, 0.06, 'triangle', 0.05);
      break;
    case 'sink':
      // A ship going down: two blasts and a long falling groan.
      sweep(c, 'sawtooth', 140, 35, 0, 0.35, 0.14);
      sweep(c, 'sawtooth', 120, 30, 0.25, 0.4, 0.12);
      sweep(c, 'triangle', 420, 70, 0.5, 1.1, 0.07);
      break;
    case 'ping':
      tone(c, 1320, 0, 0.22, 'sine', 0.09);
      break;
    case 'hurry':
      // Time is running out: a double beep (play() is called once a second for the last ten).
      tone(c, 880, 0, 0.07, 'square', 0.06);
      tone(c, 880, 0.12, 0.07, 'square', 0.06);
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
    case 'shield':
      // A bright metallic clang: two high partials that ring out.
      tone(c, 1320, 0, 0.35, 'triangle', 0.1);
      tone(c, 1980, 0, 0.25, 'sine', 0.06);
      noise(c, 0, 0.05, 0.3, 3500);
      break;
    case 'ghost':
      // A wobbling "wooo" that slides up and down.
      sweep(c, 'sine', 300, 520, 0, 0.35, 0.12);
      sweep(c, 'sine', 520, 260, 0.3, 0.45, 0.1);
      break;
    case 'skull':
      // A low, dark knell with a rattle.
      sweep(c, 'sawtooth', 160, 60, 0, 0.5, 0.12);
      noise(c, 0.02, 0.18, 0.2, 1200);
      break;
    case 'gun':
      // A pistol shot: the crack, the thump and a short "pew" that slides down.
      noise(c, 0, 0.22, 0.45, 900);
      sweep(c, 'sine', 240, 40, 0, 0.18, 0.4);
      sweep(c, 'square', 1700, 240, 0.005, 0.16, 0.07);
      break;
  }
}
