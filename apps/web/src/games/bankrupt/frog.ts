import shadowBig from '../../assets/sprites/bankrupt/frog/shadow-big.svg';
import shadowSmall from '../../assets/sprites/bankrupt/frog/shadow-small.svg';

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
export const shadowUrl = (small: boolean) => (small ? shadowSmall : shadowBig);

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
