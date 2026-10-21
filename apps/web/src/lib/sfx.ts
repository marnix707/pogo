import { getSettings } from './settings';
import frogJump from '../assets/sfx/sfx_frog_croak_single.mp3';
import pogoHit from '../assets/sfx/sfx_pogo_stick.mp3';

const FILES = { frogJump, pogoHit } as const;
export type SfxName = keyof typeof FILES;

const VOLUME: Record<SfxName, number> = { frogJump: 0.6, pogoHit: 0.5 };

/** Sound files (the synthesized beeps live in `sound.ts`). Browsers refuse audio before the first tap; that is swallowed. */
export function playSfx(name: SfxName) {
  if (!getSettings().sound) return;
  try {
    const a = new Audio(FILES[name]);
    a.volume = VOLUME[name];
    void a.play().catch(() => undefined);
  } catch {
    /* no audio available */
  }
}
