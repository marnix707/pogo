type Urls = Record<string, string>;
const load = (files: Urls): Urls => {
  const out: Urls = {};
  for (const [path, url] of Object.entries(files)) {
    const name = /([^/]+)\.svg$/.exec(path)?.[1];
    if (name) out[name] = url;
  }
  return out;
};

const sprites = load(
  import.meta.glob('../../assets/sprites/bankrupt/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
const dice = load(
  import.meta.glob('../../assets/sprites/dice/die-*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);

/** A Bankrupt! sprite by file name (`icon-jail`, `build-house`, `token-red`, `landmark` ...). */
export const art = (name: string): string => sprites[name] ?? '';
export const dieUrl = (face: number): string => dice[`die-${face}`] ?? '';

/** Token colour per seat (the order of `state.players`). */
export const TOKEN_COLOURS = ['green', 'yellow', 'blue', 'red', 'purple', 'orange'] as const;
export const tokenOf = (seat: number) => TOKEN_COLOURS[seat % TOKEN_COLOURS.length]!;

/** The icon on a space that has no price band (the corners and the special spaces). */
export const ICON_OF_TILE: Record<string, string> = {
  start: 'icon-start',
  jail: 'icon-jail',
  auction: 'icon-auction',
  card: 'icon-cards',
  harbor: 'icon-harbor',
  airport: 'icon-airport',
  railway: 'icon-railway',
  electricity: 'icon-electricity',
};

export const BUILD_ICONS = ['build-house', 'build-shop', 'build-hotel'] as const;
