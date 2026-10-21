import { useEffect, useState } from 'react';

const dieUrls = import.meta.glob('../../assets/sprites/dice/die-*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const DIE_URL = (face: number) =>
  Object.entries(dieUrls).find(([p]) => p.endsWith(`die-${face}.svg`))?.[1];

/** The artist's face colours (die-1..6.svg): the scorecard's colour squares use them too. */
export const DIE_COLOR: Record<number, string> = {
  1: '#f7f1e4',
  2: '#fda200',
  3: '#3aaef7',
  4: '#fd5f55',
  5: '#56a786',
  6: '#935adc',
};

export function Die({
  index,
  value,
  held,
  rolling,
  interactive,
  onToggle,
}: {
  index: number;
  /** 0 = not rolled yet. */
  value: number;
  held: boolean;
  rolling: boolean;
  interactive: boolean;
  onToggle: () => void;
}) {
  // While rolling, flick through random faces. This is purely cosmetic: the real value comes
  // from the server and is what `data-value` and the settled face show.
  const [flicker, setFlicker] = useState(value);
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFlicker(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(id);
  }, [rolling]);

  const face = rolling ? flicker : value;
  const url = DIE_URL(face || 1);

  return (
    <button
      type="button"
      data-testid={`die-${index}`}
      data-value={value}
      data-held={held}
      aria-pressed={held}
      aria-label={value ? `Die ${index + 1}: ${value}${held ? ', held' : ''}` : `Die ${index + 1}`}
      disabled={!interactive}
      onClick={onToggle}
      className={`relative aspect-square w-full transition-transform disabled:cursor-default ${
        held ? '-translate-y-3' : ''
      } ${rolling ? 'animate-dice-roll' : ''}`}
      style={{
        // Shadow under the die; a held die (lifted) also gets a gold outline.
        filter: held
          ? 'drop-shadow(2px 0 0 #fda200) drop-shadow(-2px 0 0 #fda200) drop-shadow(0 2px 0 #fda200) drop-shadow(0 -2px 0 #fda200) drop-shadow(0 4px 0 #101628)'
          : 'drop-shadow(0 4px 0 #101628)',
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        className={`h-full w-full ${value === 0 && !rolling ? 'opacity-40 grayscale' : ''}`}
        style={{ imageRendering: 'pixelated' }}
      />
    </button>
  );
}
