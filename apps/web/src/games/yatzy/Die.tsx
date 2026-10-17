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
      className={`relative aspect-square w-full rounded-2xl shadow-[0_4px_0_0_rgba(0,0,0,0.18)] transition-transform disabled:cursor-default ${
        held
          ? '-translate-y-2 bg-amber-100 ring-4 ring-amber-400 dark:bg-amber-200'
          : 'bg-white dark:bg-slate-100'
      } ${rolling ? 'animate-dice-roll' : ''}`}
    >
      <span className="absolute inset-[14%] grid grid-cols-3 grid-rows-3 place-items-center">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`aspect-square w-[78%] rounded-full ${
              pips.includes(cell) ? 'bg-slate-900' : value === 0 && cell === 4 ? 'bg-slate-200' : ''
            }`}
          />
        ))}
      </span>
      {held && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Held
        </span>
      )}
    </button>
  );
}
