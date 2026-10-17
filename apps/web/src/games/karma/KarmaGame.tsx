import { useEffect, useMemo, useRef, useState } from 'react';
import { karma } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { Button } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import type { GameUiProps } from '../types';
import { KarmaRules } from './KarmaRules';
import { CardFlipContext, PlayingCard } from './PlayingCard';
import type { FlipOrigin } from './PlayingCard';

type Card = number;
const { rankOf, suitOf, canPlayRank, activeZone, cardLabel, RANK_LABEL } = karma;

const byRankThenSuit = (a: Card, b: Card) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b);

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Card scale for this phone: shrink a little on short screens, grow on tall ones. */
function useCardScale(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Fit the table, hand and opponents into the screen: ~238px of chrome plus ~442px per unit of scale.
  return Math.max(0.72, Math.min(1.12, (h - 238) / 442));
}

/** My table columns overlap by this many em so bigger cards fit beside the action buttons. */
const MY_SLOT_OVERLAP = 0.7;
/** Width of the timer + buttons column beside my table cards (w-[5.5rem] + gap). */
const ACTION_COLUMN_PX = 96;

/** Em-size of an opponent's cards: fewer opponents, bigger cards (4 seats must fit in a row). */
const seatFont = (opponents: number) =>
  opponents <= 1 ? 11 : opponents === 2 ? 9.6 : opponents === 3 ? 8.2 : 5.7;

const boxOf = (el: Element | null | undefined) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Three columns: a face-down card with a face-up card lying on top of it. */
function TableSlots({
  faceUp,
  faceDown,
  font,
  overlapEm = 0,
  floatAll = false,
  idPrefix,
  upState,
  downState,
}: {
  faceUp: (Card | null)[];
  faceDown: boolean[];
  font: number;
  /** Tuck neighbouring columns under each other by this many em so bigger cards fit. */
  overlapEm?: number;
  /** Every card floats and glows (a wordless "this player is down to the table cards"). */
  floatAll?: boolean;
  idPrefix?: string;
  upState?: (
    card: Card,
    slot: number,
  ) => {
    onClick?: () => void;
    selected?: boolean;
    dimmed?: boolean;
    playable?: boolean;
    float?: boolean;
  };
  downState?: (slot: number) => { onClick?: () => void; selected?: boolean };
}) {
  const offset = font * 2.2;
  const columnGap = overlapEm ? -font * overlapEm : font * 0.6;
  return (
    <div className="flex">
      {[0, 1, 2].map((slot) => {
        const up = faceUp[slot] ?? null;
        const down = faceDown[slot] ?? false;
        const upProps = up !== null ? upState?.(up, slot) : undefined;
        const downProps = down ? downState?.(slot) : undefined;
        return (
          <div
            key={slot}
            className="relative"
            style={{
              width: `${font * 5}px`,
              height: `${font * 7 + offset}px`,
              marginLeft: slot === 0 ? 0 : `${columnGap}px`,
            }}
          >
            {down && (
              <PlayingCard
                faceDown
                size={font}
                float={floatAll}
                className="absolute left-0 top-0"
                testId={idPrefix ? `${idPrefix}-down-${slot}` : undefined}
                onClick={downProps?.onClick}
                selected={downProps?.selected}
              />
            )}
            {up !== null && (
              <PlayingCard
                card={up}
                size={font}
                float={upProps?.float ?? floatAll}
                className="absolute left-0"
                style={{ top: `${offset}px` }}
                testId={idPrefix ? `${idPrefix}-up-${slot}` : undefined}
                onClick={upProps?.onClick}
                selected={upProps?.selected}
                dimmed={upProps?.dimmed}
                data={
                  upProps?.playable === undefined
                    ? undefined
                    : { playable: upProps.playable, rank: rankOf(up) }
                }
                flip={{ id: up }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Seat({
  player,
  member,
  current,
  finishRank,
  phase,
  font,
  overlap,
  endgame,
  seatRef,
}: {
  player: karma.KarmaPlayerView;
  member?: RoomMemberView;
  current: boolean;
  finishRank: number;
  phase: karma.KarmaPhase;
  font: number;
  overlap: boolean;
  /** Hand and deck are empty: only table cards left. */
  endgame: boolean;
  seatRef: (el: HTMLDivElement | null) => void;
}) {
  const status = player.out
    ? `Out · #${finishRank}`
    : phase === 'swap'
      ? player.ready
        ? 'Ready ✓'
        : 'Swapping…'
      : `${member?.bot ? 'CPU · ' : ''}${player.handCount} in hand`;
  return (
    <div
      ref={seatRef}
      data-testid={`seat-${player.id}`}
      data-current={current}
      data-endgame={endgame}
      className={`hud flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1.5 ${
        current ? '!border-accent' : ''
      } ${endgame && !player.out ? 'animate-pulse !border-neon' : ''} ${player.out ? 'opacity-60' : ''} ${member && !member.connected ? 'grayscale' : ''}`}
    >
      <div className="flex w-full items-center justify-center gap-1">
        <span className="text-sm" aria-hidden>
          {avatarEmoji(member?.avatar ?? '')}
        </span>
        <span className="label truncate text-[9px]">{member?.nickname ?? '?'}</span>
      </div>
      <TableSlots
        faceUp={player.faceUp}
        faceDown={player.faceDown}
        font={font}
        overlapEm={overlap ? 1.1 : 0}
        floatAll={endgame && !player.out}
      />
      <div
        className={`label text-[9px] ${current ? 'text-accent' : 'text-muted'}`}
        data-testid={`seat-status-${player.id}`}
      >
        {status}
      </div>
    </div>
  );
}

function describeEvent(ev: karma.KarmaEvent, nameOf: (id: string) => string): string {
  const who = nameOf(ev.playerId);
  let text: string;
  if (ev.kind === 'pickup') {
    text = `${who} picked up ${ev.pickedUp} card${ev.pickedUp === 1 ? '' : 's'}`;
  } else if (ev.kind === 'blind') {
    const c = cardLabel(ev.cards[0] as Card);
    text =
      ev.pickedUp > 0
        ? `${who} flipped ${c}: too low, picked up ${ev.pickedUp}`
        : `${who} flipped ${c}`;
  } else {
    text = `${who} played ${ev.cards.map(cardLabel).join(' ')}`;
  }
  if (ev.skipped.length > 0) text += ` · ${ev.skipped.map(nameOf).join(', ')} skipped`;
  if (ev.burned) text += ' 🔥 burned!';
  if (ev.out) text += ' · out!';
  return text;
}

export function KarmaGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as karma.KarmaView;
  const finished = room.status === 'finished';
  const mine = view.players.find((p) => p.id === me);
  const myTurn = !finished && game.currentPlayers.includes(me);
  const currentId = view.phase === 'play' ? view.players[view.turn]?.id : undefined;
  const member = (id: string) => room.members.find((m) => m.id === id);
  const nameOf = (id: string) => (id === me ? 'You' : (member(id)?.nickname ?? 'Someone'));

  const [sel, setSel] = useState<Card[]>([]);
  const [selDown, setSelDown] = useState<number | null>(null);
  const [swapHand, setSwapHand] = useState<Card | null>(null);
  const [swapUp, setSwapUp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [flame, setFlame] = useState(false);
  /** The pile was tapped once: tap it again to pick it up. */
  const [pileArmed, setPileArmed] = useState(false);
  /** A short message that temporarily replaces the hint (e.g. after tapping the deck). */
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const flashHint = (message: string) => {
    clearTimeout(flashTimer.current);
    setFlash(message);
    flashTimer.current = setTimeout(() => setFlash(null), 2600);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const secondsLeft = useCountdown(game.deadline, room.serverTime);

  // The cards column (beside the action buttons) caps how big my cards can be.
  const handEl = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(260);
  useEffect(() => {
    const el = handEl.current;
    if (!el) return;
    const measure = () => setHandWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sizes (px per em; a card is 5em x 7em).
  const scale = useCardScale();
  const opponentCount = view.players.length - 1;
  const myFont = 18 * scale;
  // The three table cards sit beside the action column. They are big while swapping, shrink once
  // the game is on (the hand matters then) and grow again when only table cards are left.
  const tableRoom = handWidth - 8 - ACTION_COLUMN_PX;
  const tableBig = Math.min(18 * scale, tableRoom / (15 - 2 * MY_SLOT_OVERLAP));
  const pileFont = 19.5 * scale;
  const stockFont = 14.5 * scale;
  const oppFont = seatFont(opponentCount) * Math.min(scale, 1);

  // Animations are off for the first paint (the table just appears) and with reduced motion.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const flipContext = useMemo(() => ({ enabled: armed && !prefersReducedMotion() }), [armed]);

  const zone = mine ? activeZone(mine) : 'none';
  const pile = view.pile;
  const top = pile[pile.length - 1];
  const hand = useMemo(() => [...(mine?.hand ?? [])].sort(byRankThenSuit), [mine?.hand]);
  const swapping = view.phase === 'swap' && !!mine && !mine.ready;
  const playing = view.phase === 'play' && myTurn;

  // Anchors for cards that arrive from somewhere that is not a card (deck, pile, a seat).
  const stockEl = useRef<HTMLDivElement>(null);
  const pileEl = useRef<HTMLDivElement>(null);
  const seatEls = useRef(new Map<string, HTMLDivElement>());
  const lastEvent = view.lastEvent;
  /** A card newly in my hand: drawn from the deck, or picked up from the pile. */
  const handOrigin = (): FlipOrigin | null => {
    if (!lastEvent || lastEvent.playerId !== me) return null;
    const fromPile = lastEvent.kind === 'pickup' || lastEvent.pickedUp > 0;
    // A point, not a box: the card grows out of the middle of the deck/pile at its own proportions.
    const box = boxOf(fromPile ? pileEl.current : stockEl.current);
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  };
  /** A card newly on the pile that was not on screen (an opponent's hand card): from their seat. */
  const pileOrigin = (card: Card): FlipOrigin | null => {
    if (!lastEvent || lastEvent.kind === 'pickup' || !lastEvent.cards.includes(card)) return null;
    const seat = boxOf(seatEls.current.get(lastEvent.playerId));
    return seat ? { x: seat.left + seat.width / 2, y: seat.top + seat.height / 2 } : null;
  };

  // A new move happened: forget selections and narrate it (sound, buzz, burn flash).
  const lastSeq = useRef(view.lastEvent?.seq ?? 0);
  useEffect(() => {
    const ev = view.lastEvent;
    if (!ev || ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;
    setSel([]);
    setSelDown(null);
    setPileArmed(false);
    play(ev.burned ? 'score' : ev.pickedUp > 0 ? 'error' : 'tap');
    if (ev.playerId === me) haptic(ev.burned ? 'success' : ev.pickedUp > 0 ? 'error' : 'tap');
    if (ev.burned) {
      setFlame(true);
      const t = setTimeout(() => setFlame(false), 1500);
      return () => clearTimeout(t);
    }
  }, [view.lastEvent, me]);

  // A gentle buzz when ten seconds are left on my turn.
  const warnedFor = useRef<number | null>(null);
  useEffect(() => {
    if (myTurn && secondsLeft === 10 && warnedFor.current !== game.deadline) {
      warnedFor.current = game.deadline;
      haptic('tap');
    }
  }, [myTurn, secondsLeft, game.deadline]);

  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && view.phase === 'play') {
      play('turn');
      haptic('tap');
    }
    wasMyTurn.current = myTurn;
  }, [myTurn, view.phase]);

  // ---- interactions -------------------------------------------------------------------------

  async function send(move: unknown) {
    if (busy) return undefined;
    setBusy(true);
    const res = await sendMove(move);
    setBusy(false);
    return res;
  }

  /** Swap phase: a second tap on the card you selected means "I'm done swapping". */
  async function getReady() {
    setSwapHand(null);
    setSwapUp(null);
    await send({ type: 'ready' });
  }

  function tapSwapHand(card: Card) {
    if (swapUp !== null) {
      void send({ type: 'swap', hand: card, up: swapUp });
      setSwapUp(null);
      setSwapHand(null);
    } else if (swapHand === card) {
      void getReady();
    } else {
      haptic('tap');
      setSwapHand(card);
    }
  }

  function tapSwapUp(slot: number) {
    if (swapHand !== null) {
      void send({ type: 'swap', hand: swapHand, up: slot });
      setSwapUp(null);
      setSwapHand(null);
    } else if (swapUp === slot) {
      void getReady();
    } else {
      haptic('tap');
      setSwapUp(slot);
    }
  }

  /** Play phase: tap selects; tapping a selected card again plays the whole selection. */
  function tapCard(card: Card) {
    if (!playing || !canPlayRank(pile, rankOf(card))) return;
    if (sel.includes(card)) {
      void playSelected();
      return;
    }
    haptic('tap');
    setSelDown(null);
    setPileArmed(false);
    setSel((prev) =>
      prev.length > 0 && rankOf(prev[0] as Card) === rankOf(card) ? [...prev, card] : [card],
    );
  }

  function tapDown(slot: number) {
    if (selDown === slot) {
      void playSelected();
      return;
    }
    haptic('tap');
    setSel([]);
    setPileArmed(false);
    setSelDown(slot);
  }

  function clearSelection() {
    setPileArmed(false);
    setSel([]);
    setSelDown(null);
    setSwapHand(null);
    setSwapUp(null);
  }

  function pickUpPile() {
    setPileArmed(false);
    void send({ type: 'pickup' });
  }

  /** Tap the pile once to select it, again to pick it up (two taps so it cannot happen by accident). */
  function tapPile() {
    if (view.phase !== 'play') return flashHint('Nothing to pick up yet');
    if (!myTurn) return flashHint('Wait for your turn');
    if (pile.length === 0) return flashHint('The pile is empty');
    if (pileArmed) return pickUpPile();
    haptic('tap');
    setSel([]);
    setSelDown(null);
    setPileArmed(true);
  }

  /** There is no manual drawing in Karma: you refill to three cards after playing. */
  function tapDeck() {
    flashHint('Cards are drawn for you after you play');
  }

  async function playSelected() {
    const res =
      selDown !== null
        ? await send({ type: 'playDown', index: selDown })
        : await send({ type: 'play', cards: sel });
    if (res?.ok) {
      setSel([]);
      setSelDown(null);
    }
  }

  // ---- derived text -------------------------------------------------------------------------

  let hint = '';
  if (finished) hint = 'Game over';
  else if (swapping) {
    if (swapHand !== null) hint = 'Tap a face-up card to swap, or press Ready';
    else if (swapUp !== null) hint = 'Tap a hand card to swap, or press Ready';
    else
      hint =
        'Time to swap! Tap a floating face-up card and a hand card to switch them, then press Ready';
  } else if (view.phase === 'swap') hint = 'Waiting for the others to get ready…';
  else if (myTurn && (sel.length > 0 || selDown !== null)) {
    hint = 'Tap the card again to play it';
  } else if (myTurn) {
    if (zone === 'down') hint = 'Pick a face-down card… blind!';
    else if (top === undefined) hint = 'The pile is empty: lead with anything';
    else if (rankOf(top) === 2) hint = 'A 2 is on top: play anything';
    else if (rankOf(top) === 7) hint = 'A 7 is on top: play lower, a 2 or a 10, or pick up';
    else hint = `Play ${RANK_LABEL[rankOf(top)]} or higher, a 2 or a 10, or pick up`;
  } else if (currentId) {
    hint = `${nameOf(currentId)} ${currentId === me ? 'are' : 'is'} playing…`;
  }

  const shownHint = flash ?? (pileArmed ? 'Tap the pile again to pick it up' : hint);

  // Nothing in my active cards can be played: picking up is the only move, so say so with colour.
  const activeCards = zone === 'hand' ? hand : zone === 'up' ? (mine?.faceUp ?? []) : [];
  const mustPickUp =
    playing &&
    pile.length > 0 &&
    zone !== 'down' &&
    !activeCards.some((c) => c !== null && canPlayRank(pile, rankOf(c)));

  const endgame = !!mine && view.phase === 'play' && view.stockCount === 0 && hand.length === 0;
  const tableFont = view.phase === 'swap' || endgame ? tableBig : tableBig * 0.62;

  const opponents = view.players.filter((p) => p.id !== me);
  const finishRank = (id: string) => view.finishOrder.indexOf(id) + 1;
  const selCount = selDown !== null ? 1 : sel.length;
  const cardsPlayable = zone === 'hand' || zone === 'up';

  // The hand fans out: overlap just enough to fit the row, never hiding more than ~75% of a card.
  const cardW = myFont * 5;
  const maxStrip = cardW * 0.5;
  const minStrip = cardW * 0.24;
  const strip = Math.max(
    minStrip,
    Math.min(maxStrip, hand.length > 1 ? (handWidth - 8 - cardW) / (hand.length - 1) : maxStrip),
  );
  const overflowing = cardW + strip * (hand.length - 1) > handWidth;

  return (
    <CardFlipContext.Provider value={flipContext}>
      <div
        className="flex h-full min-h-0 flex-col"
        data-testid="karma-game"
        data-phase={view.phase}
      >
        <div className="flex gap-2 px-3 pb-2">
          {opponents.map((p) => (
            <Seat
              key={p.id}
              player={p}
              member={member(p.id)}
              current={p.id === currentId || (view.phase === 'swap' && !p.ready)}
              finishRank={finishRank(p.id)}
              phase={view.phase}
              font={oppFont}
              overlap={opponentCount >= 3}
              endgame={view.phase === 'play' && view.stockCount === 0 && p.handCount === 0}
              seatRef={(el) => {
                if (el) seatEls.current.set(p.id, el);
                else seatEls.current.delete(p.id);
              }}
            />
          ))}
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center gap-4 px-4"
          onClick={clearSelection}
        >
          <div className="flex shrink-0 items-center gap-5 pb-5">
            <div
              ref={stockEl}
              className="relative"
              data-testid="stock"
              data-count={view.stockCount}
              onClick={(e) => {
                e.stopPropagation();
                tapDeck();
              }}
            >
              {view.stockCount > 0 ? (
                <PlayingCard faceDown size={stockFont} />
              ) : (
                <div
                  className="rounded-[0.55em] border-2 border-dashed border-onbg/40"
                  style={{ width: `${stockFont * 5}px`, height: `${stockFont * 7}px` }}
                />
              )}
              <span className="label absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-onbg">
                Deck {view.stockCount}
              </span>
            </div>

            <div
              ref={pileEl}
              className="relative"
              data-testid="pile"
              data-count={pile.length}
              data-armed={pileArmed}
              role="button"
              aria-label="Pile: tap twice to pick up"
              onClick={(e) => {
                e.stopPropagation();
                tapPile();
              }}
              style={{ width: `${pileFont * 6.2}px`, height: `${pileFont * 7}px` }}
            >
              {pileArmed && (
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-neon" />
              )}
              {pile.length === 0 ? (
                <div
                  className="absolute left-1/2 top-0 -translate-x-1/2 rounded-[0.55em] border-2 border-dashed border-onbg/40"
                  style={{ width: `${pileFont * 5}px`, height: `${pileFont * 7}px` }}
                />
              ) : (
                pile.slice(-3).map((c, i, shown) => {
                  const fromTop = shown.length - 1 - i;
                  return (
                    <PlayingCard
                      key={c}
                      card={c}
                      size={pileFont}
                      tilt={fromTop === 0 ? 0 : fromTop % 2 ? -7 : 6}
                      className="absolute top-0"
                      style={{ left: `${pileFont * (1.1 - fromTop * 0.6)}px` }}
                      testId={fromTop === 0 ? 'pile-top' : undefined}
                      flip={{ id: c, origin: () => pileOrigin(c) }}
                    />
                  );
                })
              )}
              {flame && (
                <span
                  data-testid="burn-flash"
                  className="animate-pop absolute inset-0 flex items-center justify-center text-6xl"
                  aria-hidden
                >
                  🔥
                </span>
              )}
              <span className="label absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-onbg">
                {pileArmed ? 'Tap to pick up' : `Pile ${pile.length}`}
                {!pileArmed && view.burned > 0 && ` · 🔥 ${view.burned}`}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="label min-h-4 text-[10px] leading-snug text-onbg/80"
              data-testid="karma-event"
              aria-live="polite"
            >
              {view.lastEvent ? describeEvent(view.lastEvent, nameOf) : ' '}
            </p>
            <p
              className={`mt-1.5 text-sm font-semibold leading-snug ${myTurn ? 'text-onbg' : 'text-onbg/80'}`}
              data-testid="karma-hint"
              data-my-turn={myTurn}
            >
              {shownHint}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRulesOpen(true);
              }}
              aria-label="Rules"
              className="label mt-2 rounded-md border-2 border-onbg/40 px-2 py-1 text-[10px] text-onbg"
            >
              Rules ?
            </button>
          </div>
        </div>

        {mine && !finished && (
          <div className="border-t-2 border-edge/60 bg-panel px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 text-ink">
            <div className="mx-auto flex max-w-md flex-col gap-1">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 justify-center">
                  <TableSlots
                    faceUp={mine.faceUp}
                    faceDown={mine.faceDown}
                    font={tableFont}
                    overlapEm={MY_SLOT_OVERLAP}
                    idPrefix="my"
                    upState={(card, slot) => {
                      if (swapping)
                        return {
                          onClick: () => tapSwapUp(slot),
                          selected: swapUp === slot,
                          float: true,
                        };
                      if (playing && zone === 'up') {
                        return {
                          onClick: () => tapCard(card),
                          selected: sel.includes(card),
                          dimmed: !canPlayRank(pile, rankOf(card)),
                          playable: canPlayRank(pile, rankOf(card)),
                        };
                      }
                      return {};
                    }}
                    downState={(slot) =>
                      playing && zone === 'down'
                        ? { onClick: () => tapDown(slot), selected: selDown === slot }
                        : {}
                    }
                  />
                </div>
                <div className="flex w-[5.5rem] shrink-0 flex-col gap-1.5">
                  {view.phase === 'play' && secondsLeft !== null && (
                    <div
                      data-testid="karma-timer"
                      data-my-turn={myTurn}
                      data-seconds={secondsLeft}
                      className={`rounded-lg border-2 px-1 py-1 text-center ${
                        secondsLeft <= 10
                          ? 'animate-pulse border-danger text-danger'
                          : 'border-edge/40'
                      }`}
                    >
                      <p className="label text-[9px] leading-none text-muted">
                        {myTurn ? 'Your turn' : `${nameOf(currentId ?? '')}`.slice(0, 10)}
                      </p>
                      <p className="text-xl font-bold leading-tight tabular-nums">{secondsLeft}s</p>
                    </div>
                  )}
                  {swapping && (
                    <Button
                      data-testid="karma-ready"
                      className="min-h-9 !px-2 !text-xs"
                      disabled={busy}
                      onClick={() => void getReady()}
                    >
                      Ready
                    </Button>
                  )}
                  {view.phase === 'play' && (
                    <div
                      className={`flex flex-col gap-1.5 ${playing ? '' : 'invisible'}`}
                      aria-hidden={!playing}
                    >
                      <Button
                        data-testid="karma-play"
                        className="min-h-9 !px-2 !text-xs"
                        disabled={busy || selCount === 0}
                        onClick={() => void playSelected()}
                      >
                        {selDown !== null
                          ? 'Flip it'
                          : selCount > 0
                            ? `Play ${selCount === 1 ? cardLabel(sel[0] as Card) : `${selCount} cards`}`
                            : cardsPlayable
                              ? 'Pick a card'
                              : 'Play'}
                      </Button>
                      <Button
                        data-testid="karma-pickup"
                        data-urgent={mustPickUp}
                        variant={mustPickUp ? 'primary' : 'secondary'}
                        className={`min-h-9 !px-2 !text-xs ${
                          mustPickUp ? 'animate-pulse ring-4 ring-neon' : ''
                        }`}
                        disabled={busy || pile.length === 0}
                        onClick={pickUpPile}
                      >
                        Pick up ({pile.length})
                      </Button>
                    </div>
                  )}
                  {view.phase === 'play' && !myTurn && secondsLeft === null && (
                    <p className="label text-center text-[11px] text-muted">
                      {currentId ? `${nameOf(currentId)}'s turn` : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* overflow-x: clip (not auto) keeps cards free to fly up out of the row while animating.
                  The row centres itself with mx-auto, NOT justify-center: centring cuts off the left side of an
                  overflowing row, where the lowest cards would be unreachable. */}
              <div
                ref={handEl}
                className="flex w-full px-1 pb-1 pt-4"
                data-testid="my-hand"
                style={{
                  minHeight: `${myFont * 7 + 22}px`,
                  overflowX: overflowing ? 'auto' : 'clip',
                }}
              >
                <div className="mx-auto flex items-end">
                  {hand.map((c, i) => {
                    const playable = canPlayRank(pile, rankOf(c));
                    return (
                      <PlayingCard
                        key={c}
                        card={c}
                        size={myFont}
                        testId={`hand-card-${c}`}
                        data={{
                          playable: playing && zone === 'hand' && playable,
                          rank: rankOf(c),
                        }}
                        selected={swapping ? swapHand === c : sel.includes(c)}
                        dimmed={playing && zone === 'hand' && !playable}
                        style={{ marginLeft: i === 0 ? 0 : `-${cardW - strip}px` }}
                        flip={{ id: c, origin: handOrigin }}
                        onClick={() => (swapping ? tapSwapHand(c) : tapCard(c))}
                      />
                    );
                  })}
                </div>
              </div>

              {swapping && (
                <p className="label text-center text-[11px] text-muted">
                  Swap with the floating cards, then press Ready
                </p>
              )}
              {view.phase === 'swap' && mine.ready && (
                <p className="label text-[11px] text-muted">
                  You are ready. Waiting for the others…
                </p>
              )}
            </div>
          </div>
        )}

        <KarmaRules open={rulesOpen} onClose={() => setRulesOpen(false)} />
      </div>
    </CardFlipContext.Provider>
  );
}
