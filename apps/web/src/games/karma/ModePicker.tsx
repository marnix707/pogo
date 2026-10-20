import { karma } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

const { KARMA_MODES, KARMA_RULES } = karma;

/** Waiting-room panel: pick Normal / Party / Epic (host) and see which rules are on. */
export function ModePicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as { mode?: karma.KarmaMode; rules?: string[] };
  const mode = options.mode ?? 'normal';
  const rules =
    mode === 'epic' ? KARMA_RULES.map((r) => r.id) : mode === 'party' ? (options.rules ?? []) : [];
  const current = KARMA_MODES.find((m) => m.id === mode)!;
  return (
    <div data-testid="karma-modes">
      <div className="grid grid-cols-3 gap-2">
        {KARMA_MODES.map((m) => (
          <button
            key={m.id}
            data-testid={`karma-mode-${m.id}`}
            aria-pressed={mode === m.id}
            disabled={!isHost}
            onClick={() => setOptions({ mode: m.id })}
            className={`min-h-14 rounded-md border-2 text-sm font-bold ${
              mode === m.id ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
            }`}
          >
            <span className="block text-xl leading-none">{m.emoji}</span>
            {m.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{current.blurb}</p>
      {rules.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="karma-active-rules">
          {rules.map((id) => {
            const r = karma.ruleById(id);
            return r ? (
              <li key={id} className="rounded-full border border-edge/40 px-2.5 py-1 text-xs">
                {r.emoji} {r.name}
              </li>
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}
