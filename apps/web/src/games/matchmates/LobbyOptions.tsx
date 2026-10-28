import type { matchmates } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

/** The Match bonus switch under the game card. */
export function MatesOptions({ room, isHost, setOptions }: LobbyOptionsProps) {
  const on = ((room.options ?? {}) as Partial<matchmates.MatesOptions>).matchBonus === true;
  return (
    <button
      data-testid="mates-bonus"
      aria-pressed={on}
      disabled={!isHost}
      onClick={() => setOptions({ matchBonus: !on })}
      className={`min-h-14 w-full rounded-md border-2 px-3 text-left text-sm font-bold ${
        on ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
      } ${isHost ? '' : 'opacity-50'}`}
    >
      Match bonus: {on ? 'On' : 'Off'}
      <span className="block text-xs font-normal">
        Every 4+ line gives an extra move; 5 also heals, 6+ also hits.
      </span>
    </button>
  );
}
