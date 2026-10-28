import type { matchmates } from '@pogo/shared';

type Urls = Record<string, string>;
const load = (files: Urls): Urls => {
  const out: Urls = {};
  for (const [path, url] of Object.entries(files)) {
    const name = /([^/]+)\.svg$/.exec(path)?.[1];
    if (name) out[name] = url;
  }
  return out;
};

const tiles = load(
  import.meta.glob('../../assets/sprites/matchmates/tiles/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const monsters = load(
  import.meta.glob('../../assets/sprites/matchmates/monsters/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const arenas = load(
  import.meta.glob('../../assets/sprites/matchmates/arenas/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);

/** A square's picture: an element, a berry, a bomb (by its countdown) or the hidden "?". */
export const tileUrl = (cell: matchmates.MateCell): string =>
  (cell.k === 'bomb' ? tiles[`bomb-${Math.min(3, Math.max(1, cell.fuse ?? 3))}`] : tiles[cell.k]) ??
  '';
export const iceUrl = (): string => tiles['ice-overlay'] ?? '';

export const monsterUrl = (element: matchmates.Element, evolved: boolean): string =>
  monsters[matchmatesName(element, evolved)] ?? '';
const matchmatesName = (element: matchmates.Element, evolved: boolean): string =>
  NAMES[element][evolved ? 1 : 0];
const NAMES: Record<matchmates.Element, [string, string]> = {
  fire: ['embit', 'blazemaw'],
  water: ['puddlo', 'tidalurk'],
  earth: ['sprigg', 'thornback'],
  electric: ['zappip', 'voltusk'],
  psychic: ['mindle', 'oracull'],
};
/** Base and evolved sizes in art pixels. */
export const monsterSize = (evolved: boolean): [number, number] => (evolved ? [32, 33] : [26, 27]);

export const arenaUrl = (stage: matchmates.StageId, specs: typeof matchmates.STAGE_SPECS): string =>
  arenas[specs[stage].arena] ?? '';

/** Arena art size and the two battle pads (centre of the feet), in art pixels. */
export const ARENA = { w: 160, h: 90, player: { x: 44, y: 76 }, opponent: { x: 116, y: 58 } };

export const allArt = (): string[] => [
  ...Object.values(tiles),
  ...Object.values(monsters),
  ...Object.values(arenas),
];
