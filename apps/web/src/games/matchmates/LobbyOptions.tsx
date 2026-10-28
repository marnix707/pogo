import { matchmates } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

const { HP_CHOICES } = matchmates;

/** Starting hit points under the game card. */
export function MatesOptions({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as Partial<matchmates.MatesOptions>;
  const hp = options.hp ?? HP_CHOICES[0];
  const dim = isHost ? '' : 'opacity-50';
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-col gap-1 ${dim}`} role="group" aria-label="Starting hit points">
        <span className="label text-xs">Starting HP</span>
        <div className="grid grid-cols-4 gap-2">
          {HP_CHOICES.map((n) => (
            <button
              key={n}
              data-testid={`mates-hp-${n}`}
              aria-pressed={hp === n}
              disabled={!isHost}
              onClick={() => setOptions({ ...options, hp: n })}
              className={`min-h-11 rounded-md border-2 text-sm font-bold ${
                hp === n ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
