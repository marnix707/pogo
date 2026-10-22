import { lastcard } from '@pogo/shared';

/**
 * The artist's colour-match deck: every file in `assets/sprites/colour-cards/` is picked up by its
 * name (`red-5.svg`, `blue-skip.svg`, `green-reverse.svg`, `yellow-draw2.svg`, `wild.svg`,
 * `wild-draw4.svg`, `back.svg`), so redrawn art only needs the file replaced.
 */
const files = import.meta.glob('../../assets/sprites/colour-cards/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path
    .split('/')
    .pop()!
    .replace(/\.svg$/, '');
  byName.set(name, url);
}

const COLOR_FILE = ['red', 'yellow', 'green', 'blue'] as const;

export function cardFileName(card: lastcard.Card): string {
  const info = lastcard.cardInfo(card);
  if (info.kind === 'wild') return 'wild';
  if (info.kind === 'wild4') return 'wild-draw4';
  const color = COLOR_FILE[info.color!];
  return `${color}-${info.kind === 'number' ? info.value : info.kind}`;
}

export const cardFaceUrl = (card: lastcard.Card): string | undefined =>
  byName.get(cardFileName(card));
export const cardBackUrl = (): string | undefined => byName.get('back');
