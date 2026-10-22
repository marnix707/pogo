import { uno } from '@pogo/shared';

/**
 * The artist's SVGs, when they exist: every file in `assets/sprites/uno/` is picked up by its name
 * (`red-5.svg`, `blue-skip.svg`, `wild.svg`, `wild-draw4.svg`, `back.svg`, see the README there).
 * Cards without a file are drawn as placeholders by `UnoCard`.
 */
const files = import.meta.glob('../../assets/sprites/uno/*.svg', {
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

export function cardFileName(card: uno.Card): string {
  const info = uno.cardInfo(card);
  if (info.kind === 'wild') return 'wild';
  if (info.kind === 'wild4') return 'wild-draw4';
  const color = COLOR_FILE[info.color!];
  return `${color}-${info.kind === 'number' ? info.value : info.kind}`;
}

export const unoFaceUrl = (card: uno.Card): string | undefined => byName.get(cardFileName(card));
export const unoBackUrl = (): string | undefined => byName.get('back');
