type Urls = Record<string, string>;
const files = import.meta.glob('../../assets/sprites/bankrupt/police/{car,jail}/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Urls;

const url = (path: string) => files[`../../assets/sprites/bankrupt/police/${path}.svg`] ?? '';

export type CarDir = 'left' | 'right' | 'up';

/** What the police car on the board looks like right now. */
export interface PoliceView {
  /** The frog being fetched. */
  id: string;
  colour: string;
  /** The car's centre on the top row's middle line, in board art px. */
  x: number;
  /** How long the car takes to get to `x` (a CSS transition). */
  ms: number;
  dir: CarDir;
  siren: 'a' | 'b';
  /** The arrested frog sits in the back window. */
  carrying: boolean;
  /** The frog is in the car or in the cage: its token is not drawn. */
  hideFrog: boolean;
  /** The Jail space shows the frog behind bars. */
  delivered: boolean;
  /** A 1 px bump on the arrest. */
  bump: boolean;
}

/** The car as a picture: 41 x 29 (29 x 41 for the middle of the U-turn), the arrested frog in its window. */
export function carUrl(v: Pick<PoliceView, 'dir' | 'siren' | 'carrying' | 'colour'>): string {
  const who = v.carrying ? v.colour : 'empty';
  return v.dir === 'up'
    ? url(`car/turn-up-siren-${v.siren}`)
    : url(`car/${v.dir}/${who}-siren-${v.siren}`);
}
export const jailWithUrl = (colour: string) => url(`jail/jail-with-${colour}`);

/** A fast version of the artist's sequence (the pack's timings are about 2.5 times slower), played at 80 % of that
 * speed: every time below is the fast one divided by 0.8. */
const SLOWER = 1 / 0.8;
export const POLICE = {
  sirenMs: Math.round(110 * SLOWER),
  msPerPx: 1.3 * SLOWER,
  minDriveMs: Math.round(220 * SLOWER),
  parkOffset: 28,
  uturnFrameMs: Math.round(45 * SLOWER),
  bumpMs: Math.round(80 * SLOWER),
  pauseMs: Math.round(120 * SLOWER),
  leaveMs: Math.round(240 * SLOWER),
};
