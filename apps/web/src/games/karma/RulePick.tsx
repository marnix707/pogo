import { karma } from '@pogo/shared';

/**
 * Party mode: after a game its winner switches one extra rule on or off for all next games;
 * everybody else sees who is choosing, with the rules blacked out so it is clear it is not them.
 */
export function RulePick({
  choices,
  active,
  chooser,
  mine,
  onPick,
}: {
  choices: string[];
  /** The rules that are on right now. */
  active: string[];
  chooser: string;
  mine: boolean;
  onPick: (rule: string) => void;
}) {
  return (
    <div
      data-testid="rule-pick"
      data-mine={mine}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/75 px-4 py-6"
    >
      <h2 className="text-center text-xl font-bold text-neon">
        {mine
          ? '🎉 You won! Switch an extra rule on or off'
          : `🎉 ${chooser} is choosing an extra rule…`}
      </h2>
      <ul className="grid w-full max-w-sm grid-cols-1 gap-3">
        {choices.map((id) => {
          const rule = karma.ruleById(id);
          if (!rule) return null;
          const on = active.includes(id);
          return (
            <li key={id}>
              <button
                data-testid={`rule-choice-${id}`}
                data-active={on}
                disabled={!mine}
                onClick={() => onPick(id)}
                className={`hud flex h-full min-h-32 w-full flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-[filter] ${
                  mine
                    ? 'border-neon bg-panel active:scale-95'
                    : 'border-edge/20 bg-panel brightness-[0.2] grayscale'
                }`}
              >
                <span className="text-3xl leading-none">{rule.emoji}</span>
                <span className="font-bold">{rule.name}</span>
                <span className="text-xs text-muted">{rule.description}</span>
                <span className="label mt-1 rounded-full border border-edge/40 px-2.5 py-0.5 text-xs">
                  {on ? 'On · tap to switch off' : 'Off · tap to switch on'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
