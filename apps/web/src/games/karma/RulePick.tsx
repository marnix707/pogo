import { karma } from '@pogo/shared';
import type { GameUiProps } from '../types';

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
                onClick={() => void sendMove({ type: 'pickRule', rule: id })}
                className={`hud flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-[filter] ${
                  mine
                    ? 'border-neon bg-panel active:scale-95'
                    : 'border-edge/20 bg-panel brightness-[0.2] grayscale'
                }`}
              >
                <span className="text-3xl leading-none">{rule.emoji}</span>
                <span className="flex-1">
                  <span className="block font-bold">{rule.name}</span>
                  <span className="block text-xs text-muted">{rule.description}</span>
                </span>
                <span className="label shrink-0 rounded-full border border-edge/40 px-2.5 py-0.5 text-xs">
                  {on ? 'On · switch off' : 'Off · switch on'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
