import { karma } from '@pogo/shared';
import { TopoBackground } from '../../components/TopoBackground';
import { Button, TimerDrain } from '../../components/ui';
import { useCountdown } from '../../lib/useCountdown';
import type { GameUiProps } from '../types';

/** A tick box: a green tick when the rule is on, a red cross when it is off. */
function RuleBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-on={on}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border-2 text-2xl font-bold leading-none [text-shadow:0.6px_0_0_currentColor] ${
        on
          ? 'border-[#74cca8] bg-[#74cca8]/25 text-[#74cca8]'
          : 'border-danger bg-danger/20 text-dangertext'
      }`}
    >
      {on ? '✓' : '✕'}
    </span>
  );
}

/**
 * Party mode, round 2 and later: before the cards are dealt the winner of the last game sets the
 * rules. They may change exactly ONE rule (on or off; picking another takes the first back) or choose
 * the "Skip" list item to change nothing; everybody else watches it happen live. The Confirm button
 * stays greyed out until a rule was changed or Skip was chosen, and drains like every other clock. A full-screen overlay on top of the (still empty)
 * table, so it is the first thing a new round shows.
 */
export function RoundScreen({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as karma.KarmaView;
  const pick = view.pick;
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  if (!pick) return null;
  const mine = pick.playerId === me;
  const chooser = room.members.find((m) => m.id === pick.playerId)?.nickname ?? 'The winner';
  const urgent = secondsLeft !== null && secondsLeft <= 10;
  // Confirm needs a decision: one rule changed, or Skip chosen.
  const decided = pick.changed !== null || pick.skip;
  return (
    <div
      data-testid="round-screen"
      data-mine={mine}
      className="screen-bg fixed inset-0 z-40 overflow-y-auto text-ink"
    >
      <TopoBackground />
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+3rem)]">
        <h2
          data-testid="round-title"
          className="round-pop text-center text-4xl font-bold uppercase leading-tight tracking-[0.12em]"
        >
          Round {view.round}
        </h2>
        <p className="round-sub label text-center text-sm text-neon">
          {mine
            ? '🎉 You won the last game: change ONE rule, or skip'
            : `🎉 ${chooser} won the last game and sets the rules…`}
        </p>

        <ul className="flex flex-col gap-2" data-testid="round-rules">
          {pick.choices.map((id, i) => {
            const rule = karma.ruleById(id);
            if (!rule) return null;
            const on = view.rules.includes(id);
            return (
              <li key={id} className="round-row" style={{ animationDelay: `${0.5 + i * 0.15}s` }}>
                <button
                  data-testid={`round-rule-${id}`}
                  data-active={on}
                  data-changed={pick.changed === id}
                  aria-pressed={on}
                  disabled={!mine}
                  onClick={() => void sendMove({ type: 'toggleRule', rule: id })}
                  className={`hud flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition ${
                    pick.changed === id ? 'border-neon' : 'border-edge/30'
                  } ${mine ? 'active:scale-[0.98]' : 'opacity-80'}`}
                >
                  <span className="text-3xl leading-none">{rule.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-tight">{rule.name}</span>
                    <span className="block text-xs leading-tight text-muted">
                      {rule.description}
                    </span>
                  </span>
                  <RuleBox on={on} />
                </button>
              </li>
            );
          })}
          {/* Skipping is a list item, not a button: it only selects "change nothing"; Confirm does the rest. */}
          <li
            className="round-row"
            style={{ animationDelay: `${0.5 + pick.choices.length * 0.15}s` }}
          >
            <button
              data-testid="round-skip"
              data-selected={pick.skip}
              aria-pressed={pick.skip}
              disabled={!mine}
              onClick={() => void sendMove({ type: 'skipRules' })}
              className={`hud flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition ${
                pick.skip ? 'border-neon' : 'border-edge/30'
              } ${mine ? 'active:scale-[0.98]' : 'opacity-80'}`}
            >
              <span className="text-3xl leading-none">⏭️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-tight">Skip</span>
                <span className="block text-xs leading-tight text-muted">
                  Keep the rules as they are
                </span>
              </span>
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border-2 text-2xl font-bold leading-none ${
                  pick.skip ? 'border-neon bg-neon/20 text-neon' : 'border-edge/40 text-transparent'
                }`}
              >
                ✓
              </span>
            </button>
          </li>
        </ul>

        <div className="mt-auto pt-2">
          <Button
            data-testid="round-confirm"
            className="relative w-full overflow-hidden"
            variant={mine ? 'primary' : 'secondary'}
            disabled={!mine || !decided}
            onClick={() => void sendMove({ type: 'confirmRules' })}
          >
            <TimerDrain
              deadline={game.deadline}
              serverTime={room.serverTime}
              totalSec={room.turnTimeSec}
              urgent={urgent}
            />
            <span className="relative">{mine ? 'Confirm' : `Waiting for ${chooser}…`}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
