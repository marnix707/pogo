import { useState } from 'react';
import { karma } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

const { KARMA_MODES, KARMA_RULES } = karma;

/**
 * Waiting-room panel: pick Normal / Party / Epic (host) and see which rules are on. Tapping a mode
 * also opens a small bubble under it with what it means (tap it again to close).
 */
export function ModePicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as { mode?: karma.KarmaMode; rules?: string[] };
  const mode = options.mode ?? 'normal';
  const rules =
    mode === 'epic' ? KARMA_RULES.map((r) => r.id) : mode === 'party' ? (options.rules ?? []) : [];
  const [shown, setShown] = useState<karma.KarmaMode | null>(null);
  const bubble = KARMA_MODES.find((m) => m.id === shown);
  const bubbleAt = KARMA_MODES.findIndex((m) => m.id === shown);
  return (
    <div data-testid="karma-modes">
      <div className="grid grid-cols-3 gap-2">
        {KARMA_MODES.map((m) => (
          <button
            key={m.id}
            data-testid={`karma-mode-${m.id}`}
            aria-pressed={mode === m.id}
            onClick={() => {
              if (isHost && mode !== m.id) setOptions({ mode: m.id });
              setShown(shown === m.id ? null : m.id);
            }}
            className={`min-h-14 rounded-md border-2 text-sm font-bold ${
              mode === m.id ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
            }`}
          >
            <span className="block text-xl leading-none">{m.emoji}</span>
            {m.name}
          </button>
        ))}
      </div>
      {bubble && (
        <div
          role="status"
          data-testid="karma-mode-bubble"
          className="relative mt-3 rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-sm"
        >
          <span
            aria-hidden
            className="absolute -top-[7px] h-3 w-3 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-edge/40 bg-panel2"
            style={{ left: `${(bubbleAt * 2 + 1) * (100 / 6)}%` }}
          />
          <b>
            {bubble.emoji} {bubble.name}
          </b>
          : {bubble.blurb}
          {bubble.id === 'epic' && (
            <ul className="mt-1 flex flex-col gap-0.5 text-muted">
              {KARMA_RULES.map((r) => (
                <li key={r.id}>
                  {r.emoji} {r.name}: {r.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
