import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { yatzy } from '@pogo/shared';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import { Button, TimerDrain } from '../../components/ui';
import { ArrowLeftIcon, ChatIcon, SlidersIcon } from '../../components/icons';
import { TileButton } from '../../components/TopBar';
import type { GameUiProps } from '../types';
import { Die } from './Die';
import { Scorecard } from './Scorecard';
import { useScoreFx } from './ScoreFx';

type Category = yatzy.Category;

const ROLL_ANIMATION_MS = 550;
const NO_HOLDS = [false, false, false, false, false];
const IDENTITY = [0, 1, 2, 3, 4];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function YatzyGame({ room, me, sendMove, chrome }: GameUiProps) {
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
  // Balatro-style scoring animation (the dice fly into the box and fall into the total).
  const scoreFx = useScoreFx(state);

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
  // The scores the dice would give stay hidden ("?") until the dice have stopped rolling.
  const [settledKey, setSettledKey] = useState(rollKey);
  const settled = settledKey === rollKey;
  const rollingTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (lastRollKey.current === rollKey) return;
    lastRollKey.current = rollKey;
    clearTimeout(rollingTimer.current);
    if (!rolled) return setSettledKey(rollKey);
    play('roll');
    if (myTurn) haptic('roll');
    if (reducedMotion()) return setSettledKey(rollKey);
    setRolling(state.held.map((h) => !h));
    // (Not cleared in the cleanup: kept-dice updates re-run this effect and must not cancel it.)
    rollingTimer.current = setTimeout(() => {
      setRolling(NO_HOLDS);
      setSettledKey(rollKey);
    }, ROLL_ANIMATION_MS);
  }, [rollKey, rolled, myTurn, state.held]);
  useEffect(() => () => clearTimeout(rollingTimer.current), []);

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

  // Display order of the dice: after every roll the kept dice sit on the left and the freshly
  // rolled ones on the right; it resets with the next turn.
  const orderRef = useRef({ key: '', order: IDENTITY });
  if (!rolled) orderRef.current = { key: '', order: IDENTITY };
  else if (orderRef.current.key !== rollKey) {
    const prev = orderRef.current.order;
    orderRef.current = {
      key: rollKey,
      order: [...prev.filter((i) => state.held[i]), ...prev.filter((i) => !state.held[i])],
    };
  }
  const order = orderRef.current.order;

  // Kept dice slide to their new place on the left; new dice fly in from the right.
  const dieEls = useRef(new Map<number, HTMLElement>());
  const prevRects = useRef(new Map<number, DOMRect>());
  const animatedKey = useRef('');
  useLayoutEffect(() => {
    const rects = new Map<number, DOMRect>();
    dieEls.current.forEach((el, i) => rects.set(i, el.getBoundingClientRect()));
    if (rolled && animatedKey.current !== rollKey) {
      animatedKey.current = rollKey;
      if (!reducedMotion()) {
        let arrivals = 0;
        for (const i of order) {
          const el = dieEls.current.get(i);
          const now = rects.get(i);
          const before = prevRects.current.get(i);
          if (!el || !now) continue;
          if (state.held[i] && before && state.rollsLeft < yatzy.MAX_ROLLS - 1) {
            const dx = before.left - now.left;
            if (Math.abs(dx) > 1)
              el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], {
                duration: 380,
                easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
              });
          } else {
            el.animate(
              [
                { transform: `translateX(${window.innerWidth - now.left}px)`, opacity: 0 },
                { transform: 'none', opacity: 1 },
              ],
              {
                duration: 520,
                delay: arrivals++ * 70,
                easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
                fill: 'backwards',
              },
            );
          }
        }
      }
    }
    prevRects.current = rects;
  });

  const canHold = myTurn && rolled && state.rollsLeft > 0;
  const allHeld = held.every(Boolean);
  const displayHeld = myTurn ? held : state.held;
  const urgent = secondsLeft !== null && secondsLeft <= 10;
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
      {scoreFx.overlay}
      <header className="px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div
          data-testid="turn-banner"
          data-my-turn={myTurn}
          className={`hud relative flex items-center gap-2 overflow-hidden px-2 py-1 ${
            myTurn ? '!border-neon !bg-grape' : ''
          }`}
        >
          {!finished && (
            // Everybody's clock drains in the banner (mine, but also the opponent's turn).
            <TimerDrain
              active
              deadline={game.deadline}
              serverTime={room.serverTime}
              totalSec={room.turnTimeSec}
              urgent={urgent}
            />
          )}
          {chrome && (
            <TileButton
              small
              onClick={chrome.onLeave}
              aria-label="Leave game"
              data-testid="leave-game"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </TileButton>
          )}
          <div className="min-w-0 flex-1 pl-1">
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
              <div
                className="flex justify-end gap-1.5"
                aria-label={`${state.rollsLeft} rolls left`}
              >
                {Array.from({ length: yatzy.MAX_ROLLS }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full border-2 ${
                      i < state.rollsLeft ? 'border-accent bg-accent' : 'border-muted/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
          {chrome && (
            <>
              <TileButton
                small
                onClick={chrome.onChat}
                aria-label={chrome.unread > 0 ? `Chat, ${chrome.unread} unread` : 'Chat'}
                data-testid="chat-open"
              >
                <span className="relative">
                  <ChatIcon className="h-5 w-5" />
                  {chrome.unread > 0 && (
                    <span
                      data-testid="chat-badge"
                      className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accentink"
                    >
                      {chrome.unread > 9 ? '9+' : chrome.unread}
                    </span>
                  )}
                </span>
              </TileButton>
              <TileButton
                small
                onClick={chrome.onSettings}
                aria-label="Settings"
                data-testid="settings-button"
              >
                <SlidersIcon className="h-5 w-5" />
              </TileButton>
            </>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-2">
        <Scorecard
          state={state}
          members={room.members}
          me={me}
          currentIds={game.currentPlayers}
          preview={preview}
          previewHidden={!settled}
          selected={selected}
          fillHeight={fill}
          fx={scoreFx.view}
          onSelect={(c) => {
            if (!settled) return;
            setSelected(c);
            haptic('tap');
          }}
        />
      </div>

      {!finished && (
        <div className="border-t-2 border-edge/60 bg-panel px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-ink">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <div className="mx-auto grid w-full max-w-[22rem] grid-cols-5 gap-2.5 pt-1">
              {order.map((i) => (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) dieEls.current.set(i, el);
                    else dieEls.current.delete(i);
                  }}
                >
                  <Die
                    index={i}
                    value={state.dice[i] ?? 0}
                    held={rolled && (displayHeld[i] ?? false)}
                    rolling={rolling[i] ?? false}
                    interactive={canHold}
                    onToggle={() => {
                      const next = held.map((v, j) => (j === i ? !v : v));
                      setHeld(next);
                      // Everybody sees which dice are kept right away, not only after the roll.
                      void sendMove({ type: 'hold', held: next });
                      haptic('tap');
                      play('tap');
                    }}
                  />
                </div>
              ))}
            </div>
            {myTurn ? (
              <div className="flex gap-3">
                <Button
                  data-testid="roll-button"
                  className="relative min-h-11 flex-1 overflow-hidden !px-3"
                  disabled={busy || state.rollsLeft === 0 || (rolled && allHeld)}
                  onClick={roll}
                >
                  {/* The turn clock as a draining bar inside the button. */}
                  <TimerDrain
                    deadline={game.deadline}
                    serverTime={room.serverTime}
                    totalSec={room.turnTimeSec}
                    urgent={urgent}
                  />
                  <span className="relative">
                    {rolled ? `Roll again (${state.rollsLeft})` : 'Roll dice'}
                  </span>
                </Button>
                <Button
                  data-testid="score-button"
                  variant="secondary"
                  className="min-h-11 flex-1 !px-3"
                  disabled={busy || !selected || !settled}
                  onClick={score}
                >
                  {selected
                    ? `Score ${settled ? preview[selected] : '?'}`
                    : rolled
                      ? 'Pick a category'
                      : 'Score'}
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
