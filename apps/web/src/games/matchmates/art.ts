import boardPanel from '../../assets/sprites/matchmates/board/board-7x5.svg';
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

const portraits = load(
  import.meta.glob('../../assets/sprites/matchmates/arenas-portrait/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const hud = load(
  import.meta.glob('../../assets/sprites/matchmates/hud/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
/** Files in per-element folders, keyed `<element>/<name>`. */
const loadNested = (files: Urls): Urls => {
  const out: Urls = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /\/([^/]+)\/([^/]+)\.svg$/.exec(path);
    if (m) out[`${m[1]}/${m[2]}`] = url;
  }
  return out;
};
const glow = loadNested(
  import.meta.glob('../../assets/sprites/matchmates/glow/*/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const attack = loadNested(
  import.meta.glob(
    [
      '../../assets/sprites/matchmates/attack/*/*.svg',
      '!../../assets/sprites/matchmates/attack/*/*-animated.svg',
    ],
    { eager: true, query: '?url', import: 'default' },
  ) as Urls,
);
const digits = load(
  import.meta.glob('../../assets/sprites/matchmates/attack/damage-digits/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
export const boardPanelUrl: string = boardPanel;

/** The portrait battle screen (art 140x258, laid out in art pixels: see `docs/match-mates.md`). */
export const SCREEN = {
  w: 140,
  h: 258,
  /** Screen y of the arena's top edge. */
  top: 16,
  /** Art pixels cropped off each side of the 140 wide screen (slimmer borders). */
  cropX: 0,
  boardX: 7,
  boardY: 170,
  cell: 18,
  panel: { x: 5, y: 168, w: 130, h: 94 },
  /** Where the pets stand (feet): back row, front row. Mine on the left. */
  slots: {
    me: [
      [40, 98],
      [36, 154],
    ],
    opp: [
      [102, 98],
      [106, 154],
    ],
  },
} as const;
export const portraitUrl = (
  stage: matchmates.StageId,
  specs: typeof matchmates.STAGE_SPECS,
): string => portraits[specs[stage].arena] ?? '';
export const hudUrl = (name: string): string => hud[name] ?? '';
/** Match glow (pulse 00-05, burst 00-07) in the colour of a kind; berries and the like glow gold. */
export const glowUrl = (kind: string, anim: 'pulse' | 'burst', n: number): string =>
  glow[`${glow[`${kind}/${anim}-00`] ? kind : 'gold'}/${anim}-0${n}`] ?? '';
/** Attack sprites: spirit-00..03, spirit-charged-00..03, trail-0..2, impact-00..05. */
export const attackUrl = (element: string, name: string): string =>
  attack[`${element}/${name}`] ?? '';
export const digitUrl = (name: string): string => digits[name] ?? '';

/** A square's picture: an element, a berry, a bomb (by its countdown) or the hidden "?". */
export const tileUrl = (cell: matchmates.MateCell): string =>
  (cell.k === 'bomb' ? tiles[`bomb-${Math.min(3, Math.max(1, cell.fuse ?? 3))}`] : tiles[cell.k]) ??
  '';
export const iceUrl = (): string => tiles['ice-overlay'] ?? '';
/** The berry's glint + sparkle loop (an overlay the size of the tile): berries are meant to stand out. */
export const berryShineUrl = (): string => tiles['berry-shine-animated'] ?? '';

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
  ...Object.values(portraits),
  ...Object.values(hud),
  ...Object.values(glow),
  ...Object.values(attack),
  ...Object.values(digits),
  boardPanelUrl,
];

const edgeCache = new Map<string, Promise<{ top: string; bottom: string }>>();
/**
 * The average colour of the top and of the bottom row of an arena picture: the screen is painted with them
 * above and below the arena so the background covers the whole phone (the arena art itself stays at its
 * whole-number scale, so the pixels never blur).
 */
export function arenaEdgeColors(url: string): Promise<{ top: string; bottom: string }> {
  const hit = edgeCache.get(url);
  if (hit) return hit;
  const p = new Promise<{ top: string; bottom: string }>((resolve) => {
    const fallback = { top: '#101628', bottom: '#101628' };
    const img = new Image();
    img.onload = () => {
      try {
        const w = 140;
        const h = 258;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(fallback);
        ctx.drawImage(img, 0, 0, w, h);
        const avg = (y: number): string => {
          const d = ctx.getImageData(0, y, w, 1).data;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let i = 0; i < d.length; i += 4) {
            r += d[i] as number;
            g += d[i + 1] as number;
            b += d[i + 2] as number;
          }
          const n = d.length / 4;
          return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
        };
        resolve({ top: avg(0), bottom: avg(h - 1) });
      } catch {
        resolve(fallback);
      }
    };
    img.onerror = () => resolve(fallback);
    img.src = url;
  });
  edgeCache.set(url, p);
  return p;
}
