import { karma } from '@pogo/shared';

/**
 * Party mode: the winner of the game picks one of the offered rules for all next games; everybody
 * else sees who is choosing.
 */
export function RulePick({
  choices,
  chooser,
  mine,
  onPick,
}: {
  choices: string[];
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
        {mine ? '🎉 You won! Pick a rule for the next game' : `🎉 ${chooser} is picking a rule…`}
      </h2>
      <ul className="grid w-full max-w-sm grid-cols-2 gap-3">
        {choices.map((id) => {
          const rule = karma.ruleById(id);
          if (!rule) return null;
          return (
            <li key={id}>
              <button
                data-testid={`rule-choice-${id}`}
                disabled={!mine}
                onClick={() => onPick(id)}
                className="hud flex h-full min-h-32 w-full flex-col items-center gap-1 rounded-lg border-2 border-edge/40 bg-panel p-3 text-center enabled:active:scale-95 enabled:border-neon disabled:opacity-80"
              >
                <span className="text-3xl leading-none">{rule.emoji}</span>
                <span className="font-bold">{rule.name}</span>
                <span className="text-xs text-muted">{rule.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
