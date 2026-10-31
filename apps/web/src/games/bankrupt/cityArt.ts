type Urls = Record<string, string>;
const load = (files: Urls): Urls => {
  const out: Urls = {};
  for (const [path, url] of Object.entries(files)) {
    const name = /([^/]+)\.svg$/.exec(path)?.[1];
    if (name) out[name] = url;
  }
  return out;
};

/** The reskin (assets/sprites/bankrupt/city, the artist's "city board game" kit): board, hall, tokens, owner frames, dice and the card parts. */
const files = load(
  import.meta.glob('../../assets/sprites/bankrupt/city/**/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Urls,
);
export const cityArt = (name: string): string => files[name] ?? '';

/** The art px the kit is drawn in. */
export const BOARD_PX = 257;
export const TILE_PX = 33;
export const TILE_PITCH = 32;
/** The inner area of the board (x, y, w, h): the hall and the dice go there. */
export const INNER: readonly [number, number, number, number] = [32, 32, 193, 193];

/** The card art / header key of a space (`new-york`, `power` for Electricity ...). */
export const slug = (tile: { id: string; name: string }) =>
  tile.id === 'electricity' ? 'power' : tile.name.toLowerCase().replace(/\s+/g, '-');
