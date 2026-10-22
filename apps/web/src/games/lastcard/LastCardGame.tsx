import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lastcard } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { Avatar, Button, TimerDrain } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import type { GameUiProps } from '../types';
import { CARD_COLORS, ColourCard } from './ColourCard';

const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
/** How long the "UNO!" announcement stays on screen. */
const UNO_CALL_MS = 1900;
/** After somebody drops to one card without UNO!, the next move waits this long (they can be called out). */
const CALL_HOLD_MS = 1500;

/** One opponent: face, name, how many cards they hold, and whether they called UNO!. */
function Seat({
  player,
  member,
  active,
  catchable,
  onCatch,
}: {
  player: lastcard.LastCardPlayerView;
  member: RoomMemberView | undefined;
  active: boolean;
  /** This player went to one card without UNO!: they can still be called out. */
  catchable: boolean;
  onCatch: () => void;
}) {
  return (
    <div
      data-testid={`lastcard-seat-${player.id}`}
      data-count={player.count}
      data-called={player.called}
      data-active={active}
      data-catchable={catchable}
      className={`hud flex min-w-0 flex-1 flex-col items-center gap-1 px-1.5 py-1.5 ${active ? '!bg-neon !text-accentink' : ''} ${catchable ? 'outline outline-2 outline-danger' : ''}`}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <Avatar avatar={member?.avatar ?? 'fox'} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold leading-tight">
          <PlayerName name={member?.nickname ?? '?'} />
        </span>
      </div>
      <div className="flex w-full items-center justify-between gap-1">
        <span className="flex">
          {Array.from({ length: Math.min(player.count, 6) }, (_, i) => (
            <ColourCard
              key={i}
              faceDown
              size={2.2}
              style={{ marginLeft: i === 0 ? 0 : '-0.9em' }}
            />
          ))}
        </span>
        <span
          className="text-lg font-bold leading-none"
          data-testid={`lastcard-count-${player.id}`}
        >
          {player.count}
        </span>
      </div>
      {player.called && player.count === 1 && (
        <span
          data-testid={`uno-badge-${player.id}`}
          className="label rounded bg-danger px-1.5 py-0.5 text-[10px] text-white"
        >
          UNO!
        </span>
      )}
      {catchable && (
        <button
          type="button"
          onClick={onCatch}
          data-testid={`uno-callout-${player.id}`}
          className="lastcard-btn-urgent label w-full rounded bg-danger px-1.5 py-1 text-[11px] text-white"
        >
          Call out!
        </button>
      )}
    </div>
  );
}

function describe(
  ev: lastcard.LastCardEvent | null,
  nameOf: (id: string) => string,
  me: string,
): string {
  if (!ev) return '';
  const who = nameOf(ev.playerId);
  const verb = (you: string, other: string) => (ev.playerId === me ? you : other);
  let text = '';
  switch (ev.kind) {
    case 'play':
      text = `${who} ${verb('played', 'played')} ${lastcard.cardLabel(ev.card!)}`;
      if (ev.color !== null && lastcard.isWild(ev.card!)) text += ` → ${COLOR_NAMES[ev.color]}`;
      if (ev.reversed) text += ' · direction reversed';
      if (ev.victim) {
        text += ` · ${nameOf(ev.victim.playerId)} ${ev.victim.playerId === me ? 'draw' : 'draws'} ${ev.victim.count}`;
      } else if (ev.skipped.length > 0) {
        text += ` · ${nameOf(ev.skipped[0]!)} ${ev.skipped[0] === me ? 'are' : 'is'} skipped`;
      }
      if (ev.uno) text += ' · UNO!';
      if (ev.out) text += ' · out!';
      break;
    case 'draw':
      text = `${who} ${verb('drew', 'drew')} a card`;
      break;
    case 'pass':
      text = `${who} ${verb('passed', 'passed')}`;
      break;
    case 'uno':
      text = `${who} ${verb('called', 'called')} UNO!`;
      break;
    case 'callout':
      text = `${who} called out ${nameOf(ev.victim?.playerId ?? '')} · +${ev.victim?.count ?? 4} cards`;
      break;
  }
  return text;
}

export function LastCardGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as lastcard.LastCardView;
  const finished = room.status === 'finished' || view.phase === 'over';
  const myTurn = !finished && game.currentPlayers.includes(me);
  const member = (id: string) => room.members.find((m) => m.id === id);
  const nameOf = (id: string) => (id === me ? 'You' : (member(id)?.nickname ?? 'Someone'));
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  const currentId = view.players[view.turn]?.id;

  const [busy, setBusy] = useState(false);
  const [pendingWild, setPendingWild] = useState<lastcard.Card | null>(null);
  /** Hold two cards on my turn and arm UNO!: the next card is played together with it. */
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const flashHint = (message: string) => {
    clearTimeout(flashTimer.current);
    setFlash(message);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const send = async (move: lastcard.LastCardMove) => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await sendMove(move);
      return res.ok;
    } finally {
      setBusy(false);
    }
  };

  const seq = view.lastEvent?.seq ?? 0;
  // A new move arrived: forget the armed UNO! and the colour picker.
  useEffect(() => {
    setArmed(false);
    setPendingWild(null);
  }, [seq]);

  // Sounds and buzzes for what just happened (not for the state we join in).
  const lastSeq = useRef(seq);
  useEffect(() => {
    const ev = view.lastEvent;
    if (!ev || ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;
    if (ev.victim?.playerId === me) {
      play('error');
      haptic('error');
    } else if (ev.playerId !== me) {
      play('tap');
    }
  }, [view.lastEvent, me]);
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      play('turn');
      haptic('tap');
    }
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // "UNO!" announcement: shown for everybody when somebody calls it (not for a call made before we joined).
  const [call, setCall] = useState<{ seq: number; playerId: string } | null>(null);
  const seenCall = useRef(view.unoCall?.seq ?? 0);
  const callTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const c = view.unoCall;
    if (!c || c.seq === seenCall.current) return;
    seenCall.current = c.seq;
    setCall(c);
    play('score');
    haptic(c.playerId === me ? 'success' : 'tap');
    clearTimeout(callTimer.current);
    callTimer.current = setTimeout(() => setCall(null), UNO_CALL_MS);
  }, [view.unoCall, me]);
  useEffect(() => () => clearTimeout(callTimer.current), []);

  // Called out: a red announcement for everybody (not for one made before we joined).
  const [caught, setCaught] = useState<{ seq: number; byId: string; targetId: string } | null>(
    null,
  );
  const seenCatch = useRef(view.catchCall?.seq ?? 0);
  const catchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const c = view.catchCall;
    if (!c || c.seq === seenCatch.current) return;
    seenCatch.current = c.seq;
    setCaught(c);
    play(c.targetId === me ? 'error' : 'score');
    haptic(c.targetId === me ? 'error' : 'tap');
    clearTimeout(catchTimer.current);
    catchTimer.current = setTimeout(() => setCaught(null), UNO_CALL_MS);
  }, [view.catchCall, me]);
  useEffect(() => () => clearTimeout(catchTimer.current), []);

  // Somebody else went down to one card without UNO!: everybody is held for a moment so the others can call
  // them out (it is too late once the next player plays, draws or passes). Not for the player themselves.
  const [held, setHeld] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(holdTimer.current);
    if (view.callWindow && view.callWindow !== me && !finished) {
      setHeld(true);
      holdTimer.current = setTimeout(() => setHeld(false), CALL_HOLD_MS);
    } else {
      setHeld(false);
    }
  }, [view.callWindow, seq, me, finished]);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const canPlay = (card: lastcard.Card): boolean => {
    if (!myTurn || busy || held) return false;
    if (view.drawn !== null && card !== view.drawn) return false;
    if (!lastcard.canPlayCard(card, view.top, view.color, view.hand)) return false;
    return !(view.hand.length === 1 && lastcard.isSpecial(card));
  };

  const playCard = (card: lastcard.Card, color?: lastcard.Color) => {
    void send({
      type: 'play',
      card,
      ...(color !== undefined ? { color } : {}),
      ...(armed && view.hand.length === 2 ? { uno: true } : {}),
    });
  };
  const tapCard = (card: lastcard.Card) => {
    if (!myTurn) {
      flashHint('Wait for your turn');
      return;
    }
    if (held) {
      flashHint('Wait… somebody may call out UNO!');
      return;
    }
    if (!canPlay(card)) {
      if (view.hand.length === 1 && lastcard.isSpecial(card))
        flashHint('You cannot finish with an action card: draw one');
      else if (view.drawn !== null && card !== view.drawn)
        flashHint('Play the card you drew, or pass');
      else if (lastcard.cardInfo(card).kind === 'wild4')
        flashHint('Wild Draw Four only without a card of the current colour');
      else flashHint('That card does not match');
      haptic('error');
      return;
    }
    haptic('tap');
    if (lastcard.isWild(card)) setPendingWild(card);
    else playCard(card);
  };

  const unoButton = () => {
    if (view.mustCall) {
      void send({ type: 'uno' });
    } else if (myTurn && view.hand.length === 2) {
      setArmed((a) => !a);
    } else {
      flashHint('UNO! is for when you have one card left');
    }
  };

  // Hand layout: fan the cards so they all fit the width when they can (overlap), scroll when they cannot.
  const handEl = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(340);
  useLayoutEffect(() => {
    const el = handEl.current;
    if (!el) return;
    const measure = () => setHandWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cardSize = 11;
  const cardW = cardSize * 5;
  const n = view.hand.length;
  const gap = 4;
  const fits = n * cardW + (n - 1) * gap <= handWidth - 24;
  const minStep = cardW * 0.42;
  const step = fits
    ? cardW + gap
    : Math.max(minStep, n > 1 ? (handWidth - 24 - cardW) / (n - 1) : cardW);

  const opponents = (() => {
    const mineIndex = view.players.findIndex((p) => p.id === me);
    if (mineIndex < 0) return view.players;
    // Clockwise from me: the player after me first.
    const rotated = [...view.players.slice(mineIndex + 1), ...view.players.slice(0, mineIndex)];
    return rotated;
  })();

  const color = CARD_COLORS[view.color];
  const urgent = view.mustCall;
  const unoState = urgent ? 'urgent' : armed ? 'armed' : 'idle';
  const event = describe(view.lastEvent, nameOf, me);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      data-testid="lastcard-game"
      data-phase={view.phase}
    >
      <div className="flex gap-2 px-3 pb-2">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            player={p}
            member={member(p.id)}
            active={!finished && p.id === currentId}
            catchable={!finished && view.callWindow === p.id && p.id !== me}
            onCatch={() => void send({ type: 'callout', target: p.id })}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3">
        <div className="flex items-center justify-center gap-7">
          <button
            type="button"
            className="relative flex flex-col items-center gap-1 disabled:opacity-100"
            onClick={() =>
              held
                ? flashHint('Wait… somebody may call out UNO!')
                : myTurn && view.drawn === null
                  ? void send({ type: 'draw' })
                  : flashHint(myTurn ? 'Play the card you drew, or pass' : 'Wait for your turn')
            }
            data-testid="lastcard-draw"
            data-enabled={myTurn && view.drawn === null}
            aria-label="Draw a card"
          >
            <span
              className="relative block"
              style={
                myTurn && view.drawn === null
                  ? { filter: 'drop-shadow(0 0 0.5rem #fda200)' }
                  : undefined
              }
            >
              <ColourCard faceDown size={13} className="absolute left-[3px] top-[3px] opacity-60" />
              <ColourCard faceDown size={13} />
            </span>
            <span className="label text-[11px] text-onbg/80" data-testid="lastcard-stock">
              {view.stockCount}
            </span>
          </button>

          <div className="flex flex-col items-center gap-1">
            <div
              className="relative rounded-[1.1rem] p-2"
              style={{ background: color, boxShadow: `0 0 1.2rem ${color}` }}
              data-testid="lastcard-color"
              data-color={view.color}
            >
              <div className="relative" style={{ width: 13 * 5, height: 13 * 7 }}>
                {view.below.map((c, i) => (
                  <ColourCard
                    key={`${c}-${i}`}
                    card={c}
                    size={13}
                    className="absolute left-0 top-0"
                    style={{ transform: `rotate(${(i - 1) * 9}deg)` }}
                  />
                ))}
                <ColourCard
                  key={view.top}
                  card={view.top}
                  size={13}
                  className="lastcard-land absolute left-0 top-0"
                  data-testid="lastcard-top"
                />
              </div>
            </div>
            <span className="label flex items-center gap-1.5 text-[11px] text-onbg">
              <span data-testid="lastcard-direction" data-direction={view.direction}>
                {view.direction === 1 ? '↻' : '↺'}
              </span>
              {COLOR_NAMES[view.color]}
            </span>
          </div>
        </div>
        <p
          className="min-h-[2.5rem] max-w-full text-center text-sm text-onbg"
          data-testid="lastcard-event"
          data-seq={seq}
        >
          {flash ??
            (view.drawn !== null && myTurn
              ? 'You drew a card you can play: play it or pass'
              : armed
                ? 'UNO! armed: your next card is played with it'
                : event)}
        </p>
      </div>

      <div
        className="relative flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        data-testid="lastcard-dock"
      >
        <div
          ref={handEl}
          className="flex items-end overflow-x-auto px-3 pb-1 pt-5"
          data-testid="lastcard-hand"
          data-dimmed={!myTurn}
          style={{ filter: !myTurn && !finished ? 'brightness(0.7)' : undefined }}
        >
          {view.hand.map((c, i) => (
            <ColourCard
              key={c}
              card={c}
              size={cardSize}
              dimmed={myTurn && !canPlay(c)}
              glow={view.drawn === c}
              data-playable={canPlay(c)}
              onClick={() => tapCard(c)}
              style={{ marginLeft: i === 0 ? 0 : step - cardW }}
              data-testid={`lastcard-card-${c}`}
            />
          ))}
        </div>

        <div className="flex gap-2 px-3">
          <Button
            variant={myTurn ? 'primary' : 'secondary'}
            className="relative min-h-14 flex-1 overflow-hidden"
            disabled={!myTurn || busy || held}
            onClick={() => void send(view.drawn !== null ? { type: 'pass' } : { type: 'draw' })}
            data-testid={view.drawn !== null ? 'lastcard-pass' : 'lastcard-draw-button'}
          >
            <TimerDrain
              deadline={game.deadline}
              serverTime={room.serverTime}
              totalSec={room.turnTimeSec}
              urgent={secondsLeft !== null && secondsLeft <= 10}
              active={myTurn}
            />
            <span className="relative">
              {!myTurn
                ? `${nameOf(currentId ?? '')}…`
                : held
                  ? 'Wait…'
                  : view.drawn !== null
                    ? 'Pass'
                    : 'Draw a card'}
            </span>
          </Button>
          <button
            type="button"
            onClick={unoButton}
            data-testid="uno-button"
            data-state={unoState}
            className={`min-h-14 w-32 rounded-[10px] border-2 border-line px-3 text-2xl font-bold uppercase tracking-[0.08em] shadow-[0_4px_0_#101628] active:translate-y-[2px] ${urgent ? 'lastcard-btn-urgent bg-danger text-white' : armed ? 'bg-neon text-accentink' : 'bg-panel2 text-onbg/70'}`}
          >
            UNO!
          </button>
        </div>
      </div>

      {pendingWild !== null && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 p-6"
          data-testid="lastcard-color-picker"
          onClick={() => setPendingWild(null)}
        >
          <p className="label text-onbg">Choose a colour</p>
          <div
            className="grid w-full max-w-xs grid-cols-2 gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {CARD_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                className="min-h-20 rounded-[12px] border-2 border-white text-lg font-bold text-white shadow-[0_4px_0_#101628]"
                style={{ background: c, textShadow: '0 1px 2px #000' }}
                onClick={() => {
                  const card = pendingWild;
                  setPendingWild(null);
                  playCard(card, i as lastcard.Color);
                }}
                data-testid={`lastcard-color-${i}`}
              >
                {COLOR_NAMES[i]}
              </button>
            ))}
          </div>
          <button className="label text-onbg underline" onClick={() => setPendingWild(null)}>
            Cancel
          </button>
        </div>
      )}

      {caught && (
        <div
          key={caught.seq}
          className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/45"
          role="status"
          data-testid="uno-caught"
          data-target={caught.targetId}
        >
          <div className="lastcard-call flex flex-col items-center gap-3">
            <span
              className="font-bold leading-none text-[#ff6a5f]"
              style={{
                fontSize: '4.5rem',
                textShadow: '0.07em 0.07em 0 #101628, 0 0 0.4em #000',
                WebkitTextStroke: '0.04em #101628',
              }}
            >
              CAUGHT!
            </span>
            <span className="flex max-w-[22rem] items-center gap-2 rounded-[10px] border-2 border-line bg-panel px-3 py-2 text-lg font-bold text-ink shadow-[0_4px_0_#101628]">
              <Avatar avatar={member(caught.targetId)?.avatar ?? 'fox'} size="md" />
              <span className="min-w-0">
                <PlayerName name={nameOf(caught.targetId)} />
                <span className="block text-sm font-normal opacity-80">
                  {caught.byId === me ? 'You' : nameOf(caught.byId)} called{' '}
                  {caught.targetId === me ? 'you' : 'them'} out: +4 cards
                </span>
              </span>
            </span>
          </div>
        </div>
      )}

      {call && (
        <div
          key={call.seq}
          className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/40"
          role="status"
          data-testid="uno-called"
          data-player={call.playerId}
        >
          <div className="lastcard-call flex flex-col items-center gap-3">
            <span
              className="font-bold leading-none text-[#ffd23f]"
              style={{
                fontSize: '5.5rem',
                textShadow: '0.07em 0.07em 0 #d9382f, 0.14em 0.14em 0 #101628, 0 0 0.4em #000',
                WebkitTextStroke: '0.04em #101628',
              }}
            >
              UNO!
            </span>
            <span className="flex items-center gap-2 rounded-[10px] border-2 border-line bg-panel px-3 py-2 text-xl font-bold text-ink shadow-[0_4px_0_#101628]">
              <Avatar avatar={member(call.playerId)?.avatar ?? 'fox'} size="md" />
              <PlayerName
                name={call.playerId === me ? 'You' : (member(call.playerId)?.nickname ?? 'Someone')}
              />
              <span className="text-base font-normal opacity-80">
                {call.playerId === me ? 'called UNO!' : 'called UNO!'}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
