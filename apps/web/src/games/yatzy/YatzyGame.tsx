import { useEffect, useMemo, useRef, useState } from 'react';
import { yatzy } from '@pogo/shared';
import { avatarEmoji } from '../../lib/avatars';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import { Button } from '../../components/ui';
import type { GameUiProps } from '../types';
import { Die } from './Die';
import { Scorecard } from './Scorecard';

type Category = yatzy.Category;

const ROLL_ANIMATION_MS = 550;
const NO_HOLDS = [false, false, false, false, false];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function YatzyGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const state = game.view as yatzy.YatzyState;
  const finished = room.status === 'finished';
  const myTurn = !finished && game.currentPlayers.includes(me);
  const currentId = game.currentPlayers[0];
  const current = room.members.find((m) => m.id === currentId);
  const myCard = state.players.find((p) => p.id === me)?.scorecard;
  const rolled = state.dice.length === yatzy.DICE_COUNT;

  const [held, setHeld] = useState<boolean[]>(() => (state.held.length ? state.held : NO_HOLDS));
  const [selected, setSelected] = useState<Category | null>(null);
  const [rolling, setRolling] = useState<boolean[]>(NO_HOLDS);
  const [busy, setBusy] = useState(false);
  const secondsLeft = useCountdown(game.deadline, room.serverTime);

  // Let the scorecard stretch to the space between the banner and the dice dock.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState<number>();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setFill(Math.max(0, el.clientHeight - padding - 4)); // 4 = the panel's 2px borders
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [finished]);

  const preview = useMemo(
    () => (myTurn && rolled && myCard ? yatzy.getPreviewScores(state.dice, myCard) : {}),
    [myTurn, rolled, myCard, state.dice],
  );

  // New turn (dice cleared): forget holds and any selection.
  useEffect(() => {
    if (state.dice.length === 0) {
      setHeld(NO_HOLDS);
      setSelected(null);
    }
  }, [state.dice.length]);

  // A selected category must stay choosable (e.g. after rolling again it may score differently).
  useEffect(() => {
    if (selected && !(selected in preview)) setSelected(null);
  }, [preview, selected]);

  // Animate (and rattle) whenever a roll lands, for every player watching.
  const rollKey = `${state.round}:${state.currentPlayerIndex}:${rolled ? state.rollsLeft : 'none'}`;
  const lastRollKey = useRef(rollKey);
  useEffect(() => {
    if (lastRollKey.current === rollKey) return;
    lastRollKey.current = rollKey;
    if (!rolled) return;
    play('roll');
    if (myTurn) haptic('roll');
    if (reducedMotion()) return;
    setRolling(state.held.map((h) => !h));
    const t = setTimeout(() => setRolling(NO_HOLDS), ROLL_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [rollKey, rolled, myTurn, state.held]);

  // Ping when the turn passes to me.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      play('turn');
      haptic('tap');
    }
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  async function roll() {
    if (busy) return;
    setBusy(true);
    await sendMove({ type: 'roll', held });
    setBusy(false);
  }

  async function score() {
    if (busy || !selected) return;
    setBusy(true);
    const res = await sendMove({ type: 'score', category: selected });
    setBusy(false);
    if (res.ok) {
      setSelected(null);
      haptic('success');
      play('score');
    }
  }

  const canHold = myTurn && rolled && state.rollsLeft > 0;
  const allHeld = held.every(Boolean);
  const displayHeld = myTurn ? held : state.held;
  const rollsUsed = yatzy.MAX_ROLLS - state.rollsLeft;

  let hint = '';
  if (myTurn) {
    if (!rolled) hint = 'Roll to start';
    else if (state.rollsLeft === 0) hint = 'Pick a category';
    else if (allHeld) hint = 'Release a die';
    else hint = 'Hold or pick';
  } else if (!finished) {
    hint = 'Rolling…';
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        data-testid="turn-banner"
        data-my-turn={myTurn}
        className={`hud mx-4 flex items-center gap-3 px-3 py-1 ${
          myTurn ? '!border-neon !bg-grape' : ''
        }`}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-neon bg-panel2 text-xl"
          aria-hidden
        >
          {finished ? '🏁' : avatarEmoji(current?.avatar ?? '')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold uppercase leading-tight tracking-[0.1em]">
            {finished ? 'Game over' : myTurn ? 'Your turn' : `${current?.nickname ?? '…'}'s turn`}
          </div>
          <div className="label truncate text-[10px] text-muted">
            Round {state.round}/{yatzy.ROUNDS}
            {hint && ` · ${hint}`}
          </div>
        </div>
        {!finished && (
          <div className="text-right">
            <div className="flex justify-end gap-1.5" aria-label={`${state.rollsLeft} rolls left`}>
              {Array.from({ length: yatzy.MAX_ROLLS }, (_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full border-2 ${
                    i < state.rollsLeft ? 'border-accent bg-accent' : 'border-muted/50'
                  }`}
                />
              ))}
            </div>
            {secondsLeft !== null && (
              <div
                data-testid="countdown"
                className={`label text-[11px] tabular-nums ${
                  secondsLeft <= 10 ? 'text-danger' : 'text-muted'
                }`}
              >
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-2">
        <Scorecard
          state={state}
          members={room.members}
          me={me}
          currentIds={game.currentPlayers}
          preview={preview}
          selected={selected}
          fillHeight={fill}
          onSelect={(c) => {
            setSelected(c);
            haptic('tap');
          }}
        />
      </div>

      {!finished && (
        <div className="border-t-2 border-edge/60 bg-panel px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-ink">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <div className="mx-auto grid w-full max-w-[16rem] grid-cols-5 gap-2 pt-1">
              {Array.from({ length: yatzy.DICE_COUNT }, (_, i) => (
                <Die
                  key={i}
                  index={i}
                  value={state.dice[i] ?? 0}
                  held={rolled && (displayHeld[i] ?? false)}
                  rolling={rolling[i] ?? false}
                  interactive={canHold}
                  onToggle={() => {
                    setHeld((h) => h.map((v, j) => (j === i ? !v : v)));
                    haptic('tap');
                    play('tap');
                  }}
                />
              ))}
            </div>
            {myTurn ? (
              <div className="flex gap-3">
                <Button
                  data-testid="roll-button"
                  className="min-h-11 flex-1 !px-3"
                  disabled={busy || state.rollsLeft === 0 || (rolled && allHeld)}
                  onClick={roll}
                >
                  {rolled ? `Roll again (${state.rollsLeft})` : 'Roll dice'}
                </Button>
                <Button
                  data-testid="score-button"
                  variant="secondary"
                  className="min-h-11 flex-1 !px-3"
                  disabled={busy || !selected}
                  onClick={score}
                >
                  {selected ? `Score ${preview[selected]}` : rolled ? 'Pick a category' : 'Score'}
                </Button>
              </div>
            ) : (
              <p className="label flex min-h-11 items-center justify-center text-center text-[11px] text-muted">
                {current?.nickname ?? 'Someone'} is playing…
              </p>
            )}
            <span className="sr-only" data-testid="rolls-used">
              {rollsUsed}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
