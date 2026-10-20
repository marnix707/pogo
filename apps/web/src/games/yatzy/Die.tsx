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
 * Every face has its own colour, so a die is easy to match with its row in the scorecard. Bright card-
 * table colours (red, orange, gold, green, blue, purple) taken from the vivid UI colours of the
 * look: against the dark slate dock they keep 3.7:1 or more (a big shape with a dark outline needs 3:1),
 * and the near-black pips read at 5.6:1 or better on every face.
 */
export const DIE_COLOR: Record<number, string> = {
  1: '#FF4C40',
  2: '#FF9A00',
  3: '#FFD23F',
  4: '#3DDC84',
  5: '#1FA2FF',
  6: '#B06CFF',
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
      className={`relative aspect-square w-full rounded-lg border-[3px] shadow-[0_4px_0_0_#0b1417] transition-transform disabled:cursor-default ${
        held ? '-translate-y-1.5 border-neon shadow-[0_5px_0_0_#0b1417]' : 'border-[#0b1417]'
      } ${rolling ? 'animate-dice-roll' : ''}`}
      style={{
        backgroundColor: DIE_COLOR[face] ?? BLANK,
        // A little light on the top edge and shade on the bottom: a chunky, solid die.
        backgroundImage: 'linear-gradient(to bottom, rgb(255 255 255 / 0.28), transparent 35%, transparent 70%, rgb(0 0 0 / 0.18))',
      }}
    >
      <span className="absolute inset-[14%] grid grid-cols-3 grid-rows-3 place-items-center">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`aspect-square w-[88%] rounded-full ${
              pips.includes(cell)
                ? 'bg-[#0b1417]'
                : value === 0 && cell === 4
                  ? 'bg-[#0b1417]/15'
                  : ''
            }`}
          />
        ))}
      </span>
    </button>
  );
}
