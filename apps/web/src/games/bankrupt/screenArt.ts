type Urls = Record<string, string>;
const files = import.meta.glob('../../assets/sprites/bankrupt/screen/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Urls;

/** A picture of the redesigned screen: `screenArt('players/card-red')`, `screenArt('dice/die-3')` ... */
export const screenArt = (name: string): string =>
  files[`../../assets/sprites/bankrupt/screen/${name}.svg`] ?? '';

/** The screen is 290 x 461 art pixels; everything on it sits on that grid. */
export const SCREEN_W = 290;
export const SCREEN_H = 461;
export const CARD_W = 84;
export const CARD_GAP = 3;

/** Left edges of a centred row of `n` player cards. */
export const rowXs = (n: number): number[] => {
  const x0 = Math.floor((SCREEN_W - (n * CARD_W + (n - 1) * CARD_GAP)) / 2);
  return Array.from({ length: n }, (_, i) => x0 + i * (CARD_W + CARD_GAP));
};
