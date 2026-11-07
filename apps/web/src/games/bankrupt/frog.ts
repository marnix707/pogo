import shadowGround from '../../assets/sprites/bankrupt/frog/shadow-ground.svg';
import jailChains from '../../assets/sprites/bankrupt/frog/jail-chains.svg';

export type FrogDir = 'up' | 'right' | 'down' | 'left';
export type FrogFrame = 'sit' | 'blink' | 'crouch' | 'leap';

const files = import.meta.glob('../../assets/sprites/bankrupt/frog/*/*/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** The frog of a colour (`red`, `blue` ...) in one frame and facing one way: 19 x 19 art pixels, centred. */
export const frogUrl = (colour: string, dir: FrogDir, frame: FrogFrame): string =>
  files[`../../assets/sprites/bankrupt/frog/${colour}/${dir}/${frame}.svg`] ?? '';
/** The chains and padlock drawn over a frog that sits in jail (19 x 19, same box as the frog). */
export const jailChainsUrl = jailChains;
/** The soft ground shadow: 25 x 9 art px, shifted to the bottom right of the frog, its top on the frog's row 13. */
export const shadowUrl = shadowGround;
// (light comes from the top left, like the board's own drop shadow: the shadow falls to the bottom RIGHT)
export const SHADOW_BOX = { w: 25, h: 9, x: -1, y: 13 };
/** How much smaller / fainter the shadow is when the frog is at the top of the hop (1 = at the highest lift). */
export const SHADOW_APEX = { scale: 0.68, opacity: 0.6 };

/** Which way a frog faces on a space of the board (the side it stands on: the walk goes round clockwise). */
export const sideDir = (pos: number, n: number): FrogDir => {
  const side = Math.floor((pos * 4) / n);
  return (['up', 'right', 'down', 'left'] as const)[Math.min(3, side)]!;
};

/** The hop of one space (330 ms, then 30 ms before the next): frames, lift in art pixels during the leap. */
export const HOP = {
  crouchMs: 70,
  leapMs: 160,
  landMs: 60,
  sitMs: 40,
  lift: [0, 2, 5, 7, 7, 5, 2, 0],
};

/** Where frogs stand when several share a space, by colour order (art px from the space's centre). */
export const FROG_OFFSETS: [number, number][] = [
  [-7, -6],
  [7, -6],
  [-7, 6],
  [7, 6],
  [0, 0],
  [0, -9],
];

/** The mega jump (a card sends the frog somewhere): up and off the screen, a beat unseen, a crash landing, dust. */
export const MEGA = {
  upMs: 380,
  hiddenMs: 70,
  dropMs: 230,
  dustMs: 420,
  totalMs: 380 + 70 + 230 + 320,
};
