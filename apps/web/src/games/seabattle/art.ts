import type { seabattle } from '@pogo/shared';

type Urls = Record<string, string>;
const load = (files: Urls): Urls => {
  const out: Urls = {};
  for (const [path, url] of Object.entries(files)) {
    const name = /([^/]+)\.svg$/.exec(path)?.[1];
    if (name) out[name] = url;
  }
  return out;
};

const ships = load(
  import.meta.glob('../../assets/sprites/battle/ships/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const tiles = load(
  import.meta.glob('../../assets/sprites/battle/tiles/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const markers = load(
  import.meta.glob('../../assets/sprites/battle/markers/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const fx = load(
  import.meta.glob('../../assets/sprites/battle/fx/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);

const two = (n: number) => String(n).padStart(2, '0');

/** A ship's picture: horizontal ships face right, vertical ones face down; `sunk` is the charred wreck. */
export const shipUrl = (kind: seabattle.ShipKind, vertical: boolean, sunk = false): string =>
  ships[`${kind}${sunk ? '-sunk' : ''}-${vertical ? 'v' : 'h'}`] ?? '';

export const WATER_FRAMES = 4;
export const waterUrl = (frame: number): string =>
  tiles[`water-grid-${two(frame % WATER_FRAMES)}`] ?? '';

export const BURN_FRAMES = 8;
export const burnUrl = (frame: number): string => markers[`burn-${two(frame % BURN_FRAMES)}`] ?? '';
export const hitUrl = (): string => markers['hit'] ?? '';
export const missUrl = (): string => markers['miss'] ?? '';
export const targetUrl = (frame: number): string => markers[`target-${two(frame % 2)}`] ?? '';

/** The bomb animation: 4 falling frames (90 ms), then a blast (10 x 80 ms) or a splash (8 x 80 ms). */
export const BOMB_FRAMES = 4;
export const BOMB_FRAME_MS = 90;
export const EXPLOSION_FRAMES = 10;
export const SPLASH_FRAMES = 8;
export const BLAST_FRAME_MS = 80;
export const bombUrl = (frame: number): string => fx[`bomb-${two(frame)}`] ?? '';
export const explosionUrl = (frame: number): string => fx[`explosion-${two(frame)}`] ?? '';
export const splashUrl = (frame: number): string => fx[`splash-${two(frame)}`] ?? '';
/** Total time of the bomb animation for a hit or a miss. */
export const bombMs = (hit: boolean): number =>
  BOMB_FRAMES * BOMB_FRAME_MS + (hit ? EXPLOSION_FRAMES : SPLASH_FRAMES) * BLAST_FRAME_MS;

/** Every ship picture, so they can be loaded up front. */
export const allArt = (): string[] => [
  ...Object.values(ships),
  ...Object.values(tiles),
  ...Object.values(markers),
  ...Object.values(fx),
];
