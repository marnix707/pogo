import { useEffect, useRef, useState } from 'react';
import { karma } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';

const { KARMA_MODES, KARMA_RULES } = karma;

/** A small bubble that floats over the UI under its trigger (the parent is `relative`). */
function Bubble({
  testId,
  align = 'center',
  children,
}: {
  testId: string;
  align?: 'left' | 'center' | 'right';
  children: React.ReactNode;
}) {
  // Centering uses a negative margin, not a translate: the bubble's slide-in animation sets
  // `transform` (and keeps its last frame), which would cancel a translate and push the bubble to
  // the right, under the next button.
  const place = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -ml-28';
  const arrow = align === 'left' ? 'left-6' : align === 'right' ? 'right-6' : 'left-1/2 -ml-1.5';
  return (
    <div
      role="status"
      data-testid={testId}
      className={`info-bubble absolute top-full z-30 mt-2 w-56 max-w-[70vw] ${place}`}
    >
      <span
        aria-hidden
        className={`absolute -top-[7px] h-3 w-3 rotate-45 border-l-2 border-t-2 border-edge/40 bg-panel2 ${arrow}`}
      />
      <div className="relative rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-left text-sm font-normal text-ink shadow-lg">
        {children}
      </div>
    </div>
  );
}

/**
 * Waiting-room panel: pick Normal / Party / Epic (host) and see which rules are on. Nothing is
 * explained by default: tapping a mode or a rule (emoji + name) floats a small bubble over the
 * screen with what it means; tap it again or anywhere else to close it.
 */
export function ModePicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as { mode?: karma.KarmaMode; rules?: string[] };
  const mode = options.mode ?? 'normal';
  // The rules that are on; Party and Epic list every rule (the ones that are off are greyed out).
  const active =
    mode === 'epic' ? KARMA_RULES.map((r) => r.id) : mode === 'party' ? (options.rules ?? []) : [];
  const listed = mode === 'normal' ? [] : KARMA_RULES.map((r) => r.id);
  const [shown, setShown] = useState<string | null>(null);
  const toggle = (key: string) => setShown((s) => (s === key ? null : key));

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
    <div data-testid="karma-modes" ref={root}>
      <div className="grid grid-cols-3 gap-2">
        {KARMA_MODES.map((m, i) => (
          <div key={m.id} className="relative">
            <button
              data-testid={`karma-mode-${m.id}`}
              aria-pressed={mode === m.id}
              onClick={() => {
                // Choosing a mode shows no bubble; tapping the chosen mode again shows (and hides) it.
                if (isHost && mode !== m.id) {
                  setOptions({ mode: m.id });
                  setShown(null);
                  return;
                }
                toggle(`mode:${m.id}`);
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
            {shown === `mode:${m.id}` && (
              <Bubble
                testId="karma-mode-bubble"
                align={i === 0 ? 'left' : i === KARMA_MODES.length - 1 ? 'right' : 'center'}
              >
                {m.blurb}
              </Bubble>
            )}
          </div>
        ))}
      </div>
      {listed.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="karma-active-rules">
          {listed.map((id) => {
            const r = karma.ruleById(id);
            const on = active.includes(id);
            return r ? (
              <li key={id} className="relative">
                <button
                  data-testid={`karma-rule-${id}`}
                  data-active={on}
                  onClick={() => toggle(`rule:${id}`)}
                  className="flex items-center gap-1.5 rounded-full border border-edge/40 px-2.5 py-1 text-xs"
                >
                  {/* The rule itself is greyed out when it is off (or for non-hosts); the tick or
                      cross behind it always keeps its full colour. */}
                  <span className={!on ? 'opacity-35' : isHost ? '' : 'opacity-60'}>
                    {r.emoji} {r.name}
                  </span>
                  <span
                    aria-label={on ? 'on' : 'off'}
                    data-testid={`karma-rule-mark-${id}`}
                    data-on={on}
                    // (the pixel font has no bold weight: the shadow thickens the mark; a dark green reads on the gold box)
                    className={`text-base font-bold leading-none [text-shadow:0.6px_0_0_currentColor] ${on ? 'text-[#14673a]' : 'text-[#b3271f]'}`}
                  >
                    {on ? '✓' : '✕'}
                  </span>
                </button>
                {shown === `rule:${id}` && (
                  <Bubble testId="karma-rule-bubble" align="left">
                    {r.description}
                  </Bubble>
                )}
              </li>
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}
