import { karma } from '@pogo/shared';
import type { GameUiProps } from '../types';

/** A chunky pixel switch (stepped corners, hard shadow): green ON with the knob right, red OFF with it left. */
function PixelToggle({ on }: { on: boolean }) {
  const steps =
    'polygon(0 4px, 4px 4px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px))';
  return (
    <span
      aria-hidden
      className="relative block h-8 w-[3.75rem] shrink-0"
      style={{ filter: 'drop-shadow(0 3px 0 rgb(0 0 0 / 0.55))' }}
    >
      <span
        className={`absolute inset-0 flex items-center px-2 text-[10px] font-bold ${
          on ? 'justify-start bg-[#74cca8] text-[#0c1424]' : 'justify-end bg-[#c14139] text-white'
        }`}
        style={{ clipPath: steps }}
      >
        {on ? 'ON' : 'OFF'}
      </span>
      <span
        className="absolute top-1 h-6 w-6 bg-white transition-[left] duration-150"
        style={{ clipPath: steps, left: on ? 'calc(100% - 1.75rem)' : '0.25rem' }}
      />
    </span>
  );
}

/**
 * Party mode, shown in the results panel under the standings: the winner switches one extra rule on
 * or off for the next games; everybody else sees who is choosing, with the rules blacked out so it
 * is clear it is not them. Renders nothing when there is nothing to choose.
 */
export function RulePick({ room, me, sendMove }: GameUiProps) {
  const view = room.game?.view as karma.KarmaView | undefined;
  const pick = view?.pick;
  if (!view || view.phase !== 'pick' || !pick) return null;
  const mine = pick.playerId === me;
  const chooser = room.members.find((m) => m.id === pick.playerId)?.nickname ?? 'The winner';
  return (
    <section
      data-testid="rule-pick"
      data-mine={mine}
      aria-label="Extra rule"
      className="rounded-lg border-2 border-edge/40 bg-panel2 p-3"
    >
      <h3 className="label mb-2 text-center text-sm font-bold text-neon">
        {mine
          ? '🎉 You won! Switch an extra rule on or off'
          : `🎉 ${chooser} is choosing an extra rule…`}
      </h3>
      <ul className="grid grid-cols-1 gap-2">
        {pick.choices.map((id) => {
          const rule = karma.ruleById(id);
          if (!rule) return null;
          const on = view.rules.includes(id);
          return (
            <li key={id}>
              <button
                data-testid={`rule-choice-${id}`}
                data-active={on}
                disabled={!mine}
                aria-pressed={on}
                onClick={() => void sendMove({ type: 'pickRule', rule: id })}
                className={`hud flex w-full items-center gap-2.5 rounded-lg border-2 px-2.5 py-2 text-left transition-[filter] ${
                  mine
                    ? 'border-neon bg-panel active:scale-95'
                    : 'border-edge/20 bg-panel brightness-[0.2] grayscale'
                }`}
              >
                <span className="text-2xl leading-none">{rule.emoji}</span>
                <PixelToggle on={on} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight">{rule.name}</span>
                  <span className="block text-[11px] leading-tight text-muted">
                    {rule.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
