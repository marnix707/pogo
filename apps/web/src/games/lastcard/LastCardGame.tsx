import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lastcard } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { Avatar, Button, TimerDrain } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { CardFlipContext, boxOf, resetFlipBoxes } from '../../lib/cardFlip';
import type { FlipOrigin } from '../../lib/cardFlip';
import { useCardScale } from '../../lib/cardScale';
import { handLayout } from '../../lib/handLayout';
import { useCountdown } from '../../lib/useCountdown';
import type { GameUiProps } from '../types';
import { CARD_COLORS, ColourCard } from './ColourCard';
import { DirectionRing } from './DirectionRing';

/** Height of everything on the table that is not a card (header, seats, event line, buttons): the cards get the rest. */
const LASTCARD_CHROME = 300;

const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
/** How long the "UNO!" announcement stays on screen. */
const UNO_CALL_MS = 1900;
/** After somebody drops to one card without UNO!, the next move waits this long (they can be called out). */
const CALL_HOLD_MS = 1500;

/** A face-down card flying from the deck to the seat of the player who drew it. */
function FlyingBack({
  from,
  to,
  delay,
  size,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  size: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    ref.current?.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        {
          transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(0.6)`,
          opacity: 0.95,
        },
      ],
      { duration: 380, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-40"
      style={{ left: from.x - size * 2.5, top: from.y - size * 3.5, opacity: 0 }}
    >
      <ColourCard faceDown size={size} />
    </span>
  );
}

/** One opponent: face, name, how many cards they hold, and whether they called UNO!. */
function Seat({
  player,
  member,
  active,
  catchable,
  onCatch,
  elRef,
}: {
  player: lastcard.LastCardPlayerView;
  member: RoomMemberView | undefined;
  active: boolean;
  /** This player went to one card without UNO!: they can still be called out. */
  catchable: boolean;
  onCatch: () => void;
  /** The seat's element (cards a player draws fly there). */
  elRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={elRef}
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
          {Array.from({ length: Math.min(player.count, 5) }, (_, i) => (
            <ColourCard
              key={i}
              faceDown
              size={2.2}
              style={{ marginLeft: i === 0 ? 0 : '-0.9em' }}
            />
          ))}
        </span>
        <span
          className="shrink-0 text-lg font-bold leading-none"
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
  // A new game starts with nothing remembered from the last one (positions of cards).
  useState(resetFlipBoxes);
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

  // Sizes (px per em; a card is 5em x 7em): the same as Karma's.
  const scale = useCardScale(LASTCARD_CHROME);
  const myFont = 18 * scale;
  const pileFont = 19.5 * scale;
  const stockFont = 14.5 * scale;

  // The hand is laid out like Karma's (lib/handLayout.ts): cards overlap by 10-30 %, shrink a little
  // before another row is added, and extra rows overlap the one above by half a card.
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
  const layout = handLayout(view.hand.length, handWidth, myFont);
  const handRows = Array.from({ length: layout.rows }, (_, r) =>
    view.hand.slice(r * layout.perRow, (r + 1) * layout.perRow),
  );
  const handFont = layout.font;
  const cardW = handFont * 5;
  const rowStep = handFont * 7 * 0.5;

  const opponents = (() => {
    const mineIndex = view.players.findIndex((p) => p.id === me);
    if (mineIndex < 0) return view.players;
    // Clockwise from me: the player after me first.
    const rotated = [...view.players.slice(mineIndex + 1), ...view.players.slice(0, mineIndex)];
    return rotated;
  })();

  const color = CARD_COLORS[view.color];
  const urgent = view.mustCall;
  // ---- card animations (the same slide as Karma's cards: lib/cardFlip.ts) ----------------------
  // Off for the first paint (the table just appears) and with reduced motion.
  const [armed2, setArmed2] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed2(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flipContext = useMemo(
    () => ({ enabled: armed2 && !reducedMotion }),
    [armed2, reducedMotion],
  );
  const stockEl = useRef<HTMLSpanElement>(null);
  const seatEls = useRef(new Map<string, HTMLDivElement>());
  const centre = (box: ReturnType<typeof boxOf>) =>
    box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  const ev = view.lastEvent;
  /** How many cards just came into my hand from the deck (a draw, a Draw Two / Four, a call-out). */
  const dealtToMe =
    !ev || ev.playerId !== me
      ? ev?.victim?.playerId === me
        ? ev.victim.count
        : 0
      : ev.kind === 'draw'
        ? ev.drew
        : ev.victim?.playerId === me
          ? ev.victim.count
          : 0;
  /** A card newly in my hand grows out of the middle of the deck, one after another. */
  const handOrigin = (): FlipOrigin | null =>
    dealtToMe > 0 ? centre(boxOf(stockEl.current)) : null;
  const handDelay = (index: number) =>
    dealtToMe > 0 ? Math.max(0, index - (view.hand.length - dealtToMe)) * 130 : 0;
  /** A card newly on the pile that was not on screen (an opponent's hand card) flies in from their seat. */
  const pileOrigin = (card: lastcard.Card): FlipOrigin | null => {
    if (!ev || ev.kind !== 'play' || ev.card !== card || ev.playerId === me) return null;
    return centre(boxOf(seatEls.current.get(ev.playerId)));
  };

  // Cards drawn by opponents fly from the deck to their seat (mine slide into my hand instead).
  const [flights, setFlights] = useState<
    { key: string; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }[]
  >([]);
  const flightSeq = useRef(seq);
  useEffect(() => {
    if (!ev || ev.seq === flightSeq.current) return;
    flightSeq.current = ev.seq;
    if (!flipContext.enabled) return;
    const from = centre(boxOf(stockEl.current));
    if (!from) return;
    const dealt: { id: string; count: number }[] = [];
    if (ev.kind === 'draw' && ev.playerId !== me && ev.drew > 0)
      dealt.push({ id: ev.playerId, count: ev.drew });
    if (ev.victim && ev.victim.playerId !== me)
      dealt.push({ id: ev.victim.playerId, count: ev.victim.count });
    const next = dealt.flatMap(({ id, count }) => {
      const to = centre(boxOf(seatEls.current.get(id)));
      return to
        ? Array.from({ length: Math.min(count, 4) }, (_, i) => ({
            key: `${ev.seq}-${id}-${i}`,
            from,
            to,
            delay: i * 110,
          }))
        : [];
    });
    if (next.length === 0) return;
    setFlights((f) => [...f, ...next]);
    const t = setTimeout(
      () => setFlights((f) => f.filter((x) => !next.some((n) => n.key === x.key))),
      900,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.seq]);

  // The direction of play turned around: the artist's rotation arrows flash around the pile.
  const [ring, setRing] = useState(0);
  const ringSeq = useRef(seq);
  useEffect(() => {
    if (!ev || ev.seq === ringSeq.current) return;
    ringSeq.current = ev.seq;
    if (ev.reversed) setRing(ev.seq);
  }, [ev]);

  const unoState = urgent ? 'urgent' : armed ? 'armed' : 'idle';
  const event = describe(view.lastEvent, nameOf, me);

  return (
    <CardFlipContext.Provider value={flipContext}>
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
              elRef={(el) => {
                if (el) seatEls.current.set(p.id, el);
                else seatEls.current.delete(p.id);
              }}
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
                ref={stockEl}
                className="relative block"
                style={
                  myTurn && view.drawn === null
                    ? { filter: 'drop-shadow(0 0 0.5rem #fda200)' }
                    : undefined
                }
              >
                <ColourCard
                  faceDown
                  size={stockFont}
                  className="absolute left-[3px] top-[3px] opacity-60"
                />
                <ColourCard faceDown size={stockFont} />
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
                <div className="relative" style={{ width: pileFont * 5, height: pileFont * 7 }}>
                  {view.below.map((c, i) => (
                    <ColourCard
                      key={`${c}-${i}`}
                      card={c}
                      size={pileFont}
                      className="absolute left-0 top-0"
                      style={{ transform: `rotate(${(i - 1) * 9}deg)` }}
                    />
                  ))}
                  <ColourCard
                    key={view.top}
                    card={view.top}
                    size={pileFont}
                    className="absolute left-0 top-0"
                    flip={{ id: view.top, origin: () => pileOrigin(view.top) }}
                    data-testid="lastcard-top"
                  />
                  <DirectionRing direction={view.direction} trigger={ring} font={pileFont} />
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
          {/* Rows centre themselves with mx-auto, NOT justify-center (that cuts off the left side when too wide). */}
          <div
            ref={handEl}
            className="flex w-full flex-col px-1 pb-1 pt-4"
            data-testid="lastcard-hand"
            data-rows={layout.rows}
            data-dimmed={!myTurn}
            style={{
              minHeight: `${handFont * 7 + rowStep * (layout.rows - 1) + 22}px`,
              overflowX: 'clip',
              filter: !myTurn && !finished ? 'brightness(0.7)' : undefined,
            }}
          >
            {handRows.map((row, r) => (
              <div
                key={r}
                className="mx-auto flex items-end"
                style={{ marginTop: r === 0 ? 0 : `-${rowStep}px` }}
              >
                {row.map((c, i) => (
                  <ColourCard
                    key={c}
                    card={c}
                    size={handFont}
                    dimmed={myTurn && !canPlay(c)}
                    glow={view.drawn === c}
                    data-playable={canPlay(c)}
                    onClick={() => tapCard(c)}
                    flip={{
                      id: c,
                      origin: handOrigin,
                      delay: handDelay(r * layout.perRow + i),
                    }}
                    // (strip > cardW = a gap; negative = overlap)
                    style={{ marginLeft: i === 0 ? 0 : layout.strip - cardW }}
                    data-testid={`lastcard-card-${c}`}
                  />
                ))}
              </div>
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
                  name={
                    call.playerId === me ? 'You' : (member(call.playerId)?.nickname ?? 'Someone')
                  }
                />
                <span className="text-base font-normal opacity-80">
                  {call.playerId === me ? 'called UNO!' : 'called UNO!'}
                </span>
              </span>
            </div>
          </div>
        )}
        {flights.map((f) => (
          <FlyingBack key={f.key} from={f.from} to={f.to} delay={f.delay} size={stockFont * 0.55} />
        ))}
      </div>
    </CardFlipContext.Provider>
  );
}
