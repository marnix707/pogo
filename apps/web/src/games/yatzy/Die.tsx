import { useEffect, useState } from 'react';

// Which of the 9 grid cells hold a pip for each face.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Every face has its own colour, so a die is easy to match with its row in the scorecard. Light
 * versions of the app palette (pink, coral, yellow, mint, cyan, lilac): the dice dock and the
 * scorecard are navy in both the teal and the dark theme, so all of them keep a contrast of 6:1 or
 * more against it, and the navy pips read at 6.7:1 or better on every face.
 */
export const DIE_COLOR: Record<number, string> = {
  1: '#FF6BDE',
  2: '#FF9A8B',
  3: '#FFE066',
  4: '#5EF2B8',
  5: '#1FE0E0',
  6: '#B79CFF',
};
const BLANK = '#e9ffff';

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
  const pips = PIPS[face] ?? [];

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
      className={`relative aspect-square w-full rounded-lg border-[3px] shadow-[0_3px_0_0_rgb(0_24_80/0.7)] transition-transform disabled:cursor-default ${
        held ? '-translate-y-1.5 border-white shadow-[0_4px_0_0_#b13d9c]' : 'border-[#001850]'
      } ${rolling ? 'animate-dice-roll' : ''}`}
      style={{ backgroundColor: DIE_COLOR[face] ?? BLANK }}
    >
      <span className="absolute inset-[14%] grid grid-cols-3 grid-rows-3 place-items-center">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`aspect-square w-[78%] rounded-full ${
              pips.includes(cell)
                ? 'bg-[#001850]'
                : value === 0 && cell === 4
                  ? 'bg-[#001850]/15'
                  : ''
            }`}
          />
        ))}
      </span>
    </button>
  );
}
