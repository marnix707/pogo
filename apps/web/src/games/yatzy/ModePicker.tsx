import { useEffect, useRef, useState } from 'react';
import type { yatzy } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

const MODES: { id: yatzy.YatzyMode; emoji: string; name: string; blurb: string }[] = [
  {
    id: 'turns',
    emoji: '🔁',
    name: 'Turn based',
    blurb: 'The classic game: one player at a time rolls, the others watch.',
  },
  {
    id: 'live',
    emoji: '⚡',
    name: 'Live',
    blurb:
      'Everybody plays at the same time with their own dice, at their own pace. When all cards are full the highest total wins.',
  },
];

/** The Yatzy mode picker under the game card (like Karma's): Turn based or Live; tap the chosen one again for what it means. */
export function YatzyModePicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const mode = ((room.options ?? {}) as { mode?: yatzy.YatzyMode }).mode ?? 'turns';
  const [shown, setShown] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setShown(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [shown]);

  return (
    <div data-testid="yatzy-modes" ref={root}>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m, i) => (
          <div key={m.id} className="relative">
            <button
              data-testid={`yatzy-mode-${m.id}`}
              aria-pressed={mode === m.id}
              onClick={() => {
                // Choosing a mode shows no bubble; tapping the chosen mode again shows (and hides) it.
                if (isHost && mode !== m.id) {
                  setOptions({ mode: m.id });
                  setShown(null);
                  return;
                }
                setShown((s) => (s === m.id ? null : m.id));
              }}
              className={`min-h-14 w-full rounded-md border-2 text-sm font-bold ${isHost ? '' : 'opacity-50'} ${
                mode === m.id
                  ? 'border-accent bg-accent text-accentink'
                  : 'border-edge/40 text-muted'
              }`}
            >
              <span className="block text-xl leading-none">{m.emoji}</span>
              {m.name}
            </button>
            {shown === m.id && (
              <div
                role="status"
                data-testid="yatzy-mode-bubble"
                className={`info-bubble absolute top-full z-30 mt-2 w-56 max-w-[70vw] ${i === 0 ? 'left-0' : 'right-0'}`}
              >
                <span
                  aria-hidden
                  className={`absolute -top-[7px] h-3 w-3 rotate-45 border-l-2 border-t-2 border-edge/40 bg-panel2 ${i === 0 ? 'left-6' : 'right-6'}`}
                />
                <div className="relative rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-left text-sm font-normal text-ink shadow-lg">
                  {m.blurb}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
