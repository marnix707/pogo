import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { Button, TimerDrain } from '../../components/ui';
import { AvatarFace } from '../../components/AvatarFace';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import type { GameUiProps } from '../types';
import { planTap } from './selection';
import { FourBurn } from './FourBurn';
import { handLayout } from './handLayout';
import { REVEAL_FLIP_MS, leftoverCount, revealPlan } from './reveal';
import { WinReveal } from './WinReveal';
import {
  KarmaTutorial,
  TUTORIAL_EVENT,
  markTutorialSeen,
  shouldShowTutorial,
} from './KarmaTutorial';
import { CardFlipContext, PlayingCard, resetFlipBoxes } from './PlayingCard';
import type { FlipOrigin } from './PlayingCard';

type Card = number;
const { rankOf, suitOf, canPlayRank, activeZone, cardLabel } = karma;

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

/** How long the cards of a burn or a failed blind card stay visible on the pile before it resolves. */
const GHOST_MS = 1100;
/** A face-down card is flipped in the middle of the screen for this long (the turn takes 3.12s, then it stays ~0.4s). */
const BLIND_REVEAL_MS = 3560;
/** The card turn itself (`win-turn` in index.css): sounds and the turn hand-over wait for it. */
const TURN_MS = 3120;
/** The winning / a later finisher's card: the turn plus a short hold. */
const WIN_REVEAL_MS = 5200;
const OUT_REVEAL_MS = 3700;
/** After a reveal is gone, moves stay locked this long so every animation has finished. */
const SETTLE_MS = 400;
/** A four-of-a-kind burn gets a bigger show: the four cards side by side, dimmed table, then the fire. */
const FOUR_BURN_MS = 2400;

/** Em-size of an opponent's cards: fewer opponents, bigger cards (4 seats must fit in a row). */
const seatFont = (opponents: number) =>
  opponents <= 1 ? 11 : opponents === 2 ? 9.6 : opponents === 3 ? 8.2 : 5.7;

const boxOf = (el: Element | null | undefined) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** A card that is turned over in place: the back shrinks to a line, then the face grows back. */
function FlipReveal({
  card,
  size,
  delay,
  className = '',
  style,
  testId,
}: {
  card: Card;
  size: number;
  /** ms until the turn starts. */
  delay: number;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size * 5, height: size * 7, ...style }}
      data-testid={testId}
    >
      <PlayingCard
        faceDown
        size={size}
        className="card-back-out absolute left-0 top-0"
        style={{ animationDelay: `${delay}ms` }}
      />
      <PlayingCard
        card={card}
        size={size}
        className="card-face-in absolute left-0 top-0"
        style={{ animationDelay: `${delay + REVEAL_FLIP_MS / 2}ms` }}
      />
    </span>
  );
}

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
  revealDown,
  revealAt,
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
  /** The game is over: the real face-down cards, turned over at `revealAt[slot]` ms. */
  revealDown?: (Card | null)[];
  revealAt?: (number | null)[];
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
            {down && revealDown?.[slot] != null && revealAt?.[slot] != null && (
              <FlipReveal
                card={revealDown[slot] as Card}
                size={font}
                delay={revealAt[slot] as number}
                className="absolute left-0 top-0"
                testId={idPrefix ? `${idPrefix}-revealed-${slot}` : undefined}
              />
            )}
            {down && !(revealDown?.[slot] != null && revealAt?.[slot] != null) && (
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

/** An opponent's hand as a small fan of face-down cards, one per card they hold. */
function HandFan({
  id,
  count,
  cardFont,
  maxWidth,
  faces,
  revealAt,
}: {
  id: string;
  count: number;
  cardFont: number;
  /** The fan squeezes its cards together to stay within this width. */
  maxWidth: number;
  /** The game is over: the real cards, turned over at `revealAt[i]` ms. */
  faces?: Card[];
  revealAt?: number[];
}) {
  const cardW = cardFont * 5;
  const strip =
    count > 1
      ? Math.max(cardW * 0.12, Math.min(cardW * 0.45, (maxWidth - cardW) / (count - 1)))
      : 0;
  return (
    <div
      className="flex items-center"
      data-testid={`seat-hand-${id}`}
      data-count={count}
      aria-label={`${count} cards in hand`}
      style={{ minHeight: `${cardFont * 7}px` }}
    >
      {Array.from({ length: count }, (_, i) =>
        faces?.[i] !== undefined && revealAt?.[i] !== undefined ? (
          <FlipReveal
            key={i}
            card={faces[i] as Card}
            size={cardFont}
            delay={revealAt[i] as number}
            style={{ marginLeft: i === 0 ? 0 : `-${cardW - strip}px` }}
          />
        ) : (
          <PlayingCard
            key={i}
            faceDown
            size={cardFont}
            style={{ marginLeft: i === 0 ? 0 : `-${cardW - strip}px` }}
          />
        ),
      )}
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
  beside,
  pickedUp,
  leftovers,
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
  /** Room for the hand fan next to the table cards (one opponent); otherwise it goes underneath. */
  beside: boolean;
  /** This player just picked up the pile: how many cards (flashes the seat). */
  pickedUp: number | null;
  /** What the loser still holds once the game is decided (turned over on their seat). */
  leftovers?: karma.KarmaLeftovers | null;
  seatRef: (el: HTMLDivElement | null) => void;
}) {
  const shown = leftovers && leftovers.playerId === player.id ? leftovers : null;
  const plan = shown ? revealPlan(shown) : null;
  const status = pickedUp
    ? `Picked up ${pickedUp}!`
    : player.out
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
      } ${pickedUp ? 'animate-pulse !border-danger bg-danger/30' : ''} ${endgame && !player.out ? 'animate-pulse !border-neon' : ''} ${player.out ? 'opacity-60' : ''} ${member && !member.connected ? 'grayscale' : ''}`}
    >
      <div className="flex w-full items-center justify-center gap-1">
        <span className="text-sm" aria-hidden>
          <AvatarFace avatar={member?.avatar ?? ''} />
        </span>
        <span className="label truncate text-[9px]">{member?.nickname ?? '?'}</span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <TableSlots
          faceUp={player.faceUp}
          faceDown={player.faceDown}
          font={font}
          overlapEm={overlap ? 1.1 : 0}
          floatAll={endgame && !player.out}
          revealDown={shown?.faceDown}
          revealAt={plan?.down}
        />
        {beside && player.handCount > 0 && (
          <HandFan
            id={player.id}
            count={player.handCount}
            cardFont={font * 0.5}
            maxWidth={font * 8}
            faces={shown?.hand}
            revealAt={plan?.hand}
          />
        )}
      </div>
      {!beside && player.handCount > 0 && (
        <HandFan
          id={player.id}
          count={player.handCount}
          cardFont={Math.max(2, font * 0.3)}
          maxWidth={font * (overlap ? 12.8 : 16.2)}
          faces={shown?.hand}
          revealAt={plan?.hand}
        />
      )}
      <div
        className={`label text-[9px] ${current ? 'text-accent' : 'text-muted'}`}
        data-testid={`seat-status-${player.id}`}
      >
        {status}
      </div>
    </div>
  );
}

/** One short line for the latest move: "Bob played 7♥", "You picked up all the cards!", ... */
function describeEvent(
  ev: karma.KarmaEvent,
  nameOf: (id: string) => string,
  extra: { timedOut: boolean; again: boolean },
): string {
  const who = nameOf(ev.playerId);
  const parts: string[] = [];
  if (ev.kind === 'pickup') {
    parts.push(`${who} picked up all the cards!`);
  } else if (ev.kind === 'blind') {
    const c = cardLabel(ev.cards[0] as Card);
    parts.push(ev.failed ? `${who} flipped ${c}, too low!` : `${who} flipped ${c}`);
  } else {
    const shown = ev.cards.map(cardLabel).join(' ');
    parts.push(ev.failed ? `${who} tried ${shown}, too low!` : `${who} played ${shown}`);
  }
  if (ev.burned) parts.push('burned 🔥');
  if (extra.again) parts.push(who === 'You' ? 'go again' : 'plays again');
  else if (ev.skipped.length > 0) parts.push(`${ev.skipped.map(nameOf).join(', ')} skipped`);
  if (ev.out) parts.push('out!');
  if (extra.timedOut) parts.push('time ran out');
  return parts.join(' · ');
}

/** The last two moves laid out in the middle of the table; a tap anywhere sends the cards back to the pile. */
function PeekOverlay({
  from,
  rows,
  onDone,
}: {
  from: { x: number; y: number };
  rows: { label: string; ev: { ev: karma.KarmaEvent } | null; text: string }[];
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'in' | 'open' | 'out'>('in');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    if (phase === 'out') return;
    setPhase('out');
    setTimeout(onDone, 280);
  };
  // Cards start (and end) at the pile: offset from the centre of the overlay.
  const r = ref.current?.getBoundingClientRect();
  const dx = r ? from.x - (r.left + r.width / 2) : 0;
  const dy = r ? from.y - (r.top + r.height / 2) : 0;
  const hidden = phase !== 'open';
  return (
    <div
      ref={ref}
      data-testid="pile-peek"
      className={`absolute inset-0 z-30 flex items-center justify-center bg-black/60 transition-opacity duration-300 motion-reduce:transition-none ${hidden ? 'opacity-0' : 'opacity-100'}`}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        className="flex flex-col items-center gap-6 px-4 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          transform: hidden ? `translate(${dx}px, ${dy}px) scale(0.3)` : 'none',
        }}
      >
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col items-center gap-2">
            <span className="label text-[10px] text-onbg/70">{row.label}</span>
            <div className="flex min-h-[7rem] items-center justify-center gap-1.5">
              {row.ev && row.ev.ev.cards.length > 0 ? (
                row.ev.ev.cards.map((c) => <PlayingCard key={c} card={c as Card} size={13} />)
              ) : (
                <span className="text-4xl" aria-hidden>
                  {row.ev ? '🫳' : '—'}
                </span>
              )}
            </div>
            <span className="text-center text-sm font-bold text-onbg">
              {row.text || 'No move yet'}
            </span>
          </div>
        ))}
        <span className="label text-[10px] text-onbg/60">Tap anywhere to put them back</span>
      </div>
    </div>
  );
}

export function KarmaGame({ room, me, sendMove }: GameUiProps) {
  // A new game starts with nothing remembered from the last one (positions of cards).
  useState(resetFlipBoxes);
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
  // First Karma game ever: a short tutorial over the swap phase. The rules sheet can replay it.
  const [tutorial, setTutorial] = useState(() => view.phase === 'swap' && shouldShowTutorial());
  useEffect(() => {
    const open = () => setTutorial(true);
    window.addEventListener(TUTORIAL_EVENT, open);
    return () => window.removeEventListener(TUTORIAL_EVENT, open);
  }, []);
  const closeTutorial = () => {
    markTutorialSeen();
    setTutorial(false);
  };
  const [flame, setFlame] = useState(false);
  /** A burn / failed blind card resolves at once on the server; keep the played cards on the pile a moment. */
  const [ghost, setGhost] = useState<Card[] | null>(null);
  const ghostTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(ghostTimer.current), []);
  const prevPile = useRef<Card[]>(view.pile);
  /** The last card of a player stays off the pile until its reveal is over (no spoilers behind it). */
  const [hiddenOut, setHiddenOut] = useState<Card[]>([]);
  const burnTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(burnTimer.current), []);
  const [fourBurn, setFourBurn] = useState<Card[] | null>(null);
  const fourTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(fourTimer.current), []);
  const flameTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(flameTimer.current), []);
  /** Someone just played their last card: reveal it with a flourish (confetti for the winner). */
  const [reveal, setReveal] = useState<{
    card: number;
    label: string;
    winner: boolean;
    /** Who played the card that is turning over. */
    by: string;
  } | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();
  /** Who just picked up the pile (flashes their seat for a moment). */
  const [pickup, setPickup] = useState<{ id: string; n: number } | null>(null);
  const pickupTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(pickupTimer.current), []);
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  /** A beat after a reveal: moves stay locked until every animation has finished. */
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (reveal) return setSettling(true);
    const t = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [reveal]);
  /** The pile was tapped: shows the last two moves (cards fly out of the pile; any tap puts them back). */
  const [peek, setPeek] = useState<{ x: number; y: number } | null>(null);
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
  const hand = useMemo(() => [...(mine?.hand ?? [])].sort(byRankThenSuit), [mine?.hand]);
  const swapping = view.phase === 'swap' && !!mine && !mine.ready;
  const lastSeq = useRef(view.lastEvent?.seq ?? 0);
  // While a card is turning over nobody may see whose turn it is: after a flip the turn passes on
  // (a card that fits) or stays with the flipper (too low: picks up the pile), and that is the answer.
  // (`revealPending` covers the render in which the move has arrived but its reveal is not set yet.)
  const newEvent = view.lastEvent;
  const revealPending =
    !!newEvent &&
    newEvent.seq !== lastSeq.current &&
    newEvent.cards.length > 0 &&
    newEvent.kind === 'blind';
  // A face-down or last card stays off the pile from the very render its move arrives until its flip is over.
  const offPile = revealPending ? [...hiddenOut, ...newEvent!.cards] : hiddenOut;
  const shownPile = ghost ?? (offPile.length > 0 ? pile.filter((c) => !offPile.includes(c)) : pile);
  const frozenBy = reveal ? reveal.by : revealPending ? newEvent!.playerId : null;
  const myTurnShown = myTurn && frozenBy === null;
  const shownTurnId = frozenBy ?? currentId;
  const playing = view.phase === 'play' && myTurnShown;

  // Anchors for cards that arrive from somewhere that is not a card (deck, pile, a seat).
  const stockEl = useRef<HTMLDivElement>(null);
  const pileEl = useRef<HTMLDivElement>(null);
  const seatEls = useRef(new Map<string, HTMLDivElement>());
  const lastEvent = view.lastEvent;
  /** A card newly in my hand: drawn from the deck, or picked up from the pile. */
  const handOrigin = (): FlipOrigin | null => {
    if (!lastEvent || lastEvent.playerId !== me) return null;
    const fromPile = lastEvent.kind === 'pickup';
    // A point, not a box: the card grows out of the middle of the deck/pile at its own proportions.
    const box = boxOf(fromPile ? pileEl.current : stockEl.current);
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  };
  /**
   * The cards of a multi-card play leave one after another and fly slower, so you can see how many
   * were thrown (all at once they looked like a single card).
   */
  const playFlight = (card: Card) => {
    const ev = lastEvent;
    if (!ev || ev.kind === 'pickup' || ev.cards.length < 2) return {};
    const i = ev.cards.indexOf(card);
    return i < 0 ? {} : { delay: i * 170, duration: 520, delayMoves: true };
  };
  /** A card newly on the pile that was not on screen (an opponent's hand card): from their seat. */
  const pileOrigin = (card: Card): FlipOrigin | null => {
    if (
      !lastEvent ||
      lastEvent.kind === 'pickup' ||
      lastEvent.kind === 'blind' ||
      lastEvent.out ||
      !lastEvent.cards.includes(card)
    )
      return null;
    const seat = boxOf(seatEls.current.get(lastEvent.playerId));
    return seat ? { x: seat.left + seat.width / 2, y: seat.top + seat.height / 2 } : null;
  };

  // A new move happened: forget selections and narrate it (sound, buzz, burn flash).
  const latest = useRef({
    nameOf,
    finishOrder: view.finishOrder,
    now: 0,
    currentId,
  });
  latest.current = {
    nameOf,
    finishOrder: view.finishOrder,
    now: room.serverTime,
    currentId,
  };
  // The one-line narration: the move BEFORE the latest one (n-1; the pile already shows the latest),
  // plus what the event itself does not say: whether the turn clock ran out, who goes again.
  interface Note {
    ev: karma.KarmaEvent;
    timedOut: boolean;
    again: boolean;
  }
  const [notes, setNotes] = useState<{ current: Note | null; previous: Note | null }>(() => ({
    current: view.lastEvent ? { ev: view.lastEvent, timedOut: false, again: false } : null,
    previous: null,
  }));
  const before = useRef({ deadline: game.deadline });
  useEffect(() => {
    const ev = view.lastEvent;
    if (!ev || ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;
    // The same player is up again (an 8 with nobody else to skip to, or a burn): say so, and nudge
    // me with the turn sound, because "your turn" never switched off and on.
    const again = !ev.out && latest.current.currentId === ev.playerId;
    if (again && ev.playerId === me && ev.kind !== 'blind') {
      play('turn');
      haptic('tap');
    }
    const note: Note = {
      again,
      ev,
      timedOut:
        before.current.deadline !== null && latest.current.now >= before.current.deadline - 300,
    };
    setNotes((n) => ({ current: note, previous: n.current }));
    // Only a face-down table card is turned over (also when it is a player's last card).
    if (ev.out && ev.kind === 'blind') {
      const winner = latest.current.finishOrder[0] === ev.playerId;
      const name = latest.current.nameOf(ev.playerId);
      setReveal({
        card: ev.cards[ev.cards.length - 1] as Card,
        winner,
        by: ev.playerId,
        label: winner ? (ev.playerId === me ? 'You win!' : `${name} wins!`) : `${name} is out`,
      });
      clearTimeout(revealTimer.current);
      setHiddenOut(ev.cards);
      revealTimer.current = setTimeout(
        () => {
          setReveal(null);
          setHiddenOut([]);
        },
        winner ? WIN_REVEAL_MS : OUT_REVEAL_MS,
      );
    } else if (ev.kind === 'blind' && ev.cards.length > 0) {
      // Every face-down card is turned over in the middle of the screen first (the same flip as the
      // winning card), playable or not; the game carries on behind it afterwards.
      const who = latest.current.nameOf(ev.playerId);
      const card = ev.cards[0] as Card;
      setReveal({
        card,
        winner: false,
        by: ev.playerId,
        label: `${who} ${who === 'You' ? 'flip' : 'flips'} ${cardLabel(card)}${
          ev.failed ? ' · too low!' : ev.burned ? ' · burns 🔥' : ''
        }`,
      });
      clearTimeout(revealTimer.current);
      setHiddenOut(ev.cards);
      revealTimer.current = setTimeout(() => {
        setReveal(null);
        setHiddenOut([]);
      }, BLIND_REVEAL_MS);
    }
    setPeek(null);
    if (ev.kind === 'pickup') {
      setPickup({ id: ev.playerId, n: ev.pickedUp });
      clearTimeout(pickupTimer.current);
      pickupTimer.current = setTimeout(() => setPickup(null), 2500);
    }
    setSel([]);
    setSelDown(null);
    // The result sound / buzz of a face-down card waits for the end of its flip (else it spoils it).
    const feedback = () => {
      play(ev.burned ? 'score' : ev.failed || ev.pickedUp > 0 ? 'error' : 'tap');
      if (ev.playerId === me)
        haptic(ev.burned ? 'success' : ev.failed || ev.pickedUp > 0 ? 'error' : 'tap');
    };
    const delayed = ev.kind === 'blind' && !ev.out;
    // A last face-down card turns over for TURN_MS first: its sound (and the winner's fanfare) waits for that.
    const outDelayed = ev.out && ev.kind === 'blind';
    if (delayed) play('tap');
    // (The last card of a player has its own reveal, which must not be spoiled by this.)
    const showcase = ev.cards.length > 0 && ev.burned && !outDelayed;
    const shown = showcase
      ? [...prevPile.current.filter((c) => !ev.cards.includes(c)), ...ev.cards]
      : [];
    const four = shown.slice(-4);
    const isFour =
      ev.burned && four.length === 4 && four.every((c) => rankOf(c) === rankOf(four[0] as Card));
    const holdMs = isFour ? FOUR_BURN_MS : GHOST_MS;
    const showBurn = () => {
      if (delayed) feedback();
      if (showcase) {
        // (With the four-card overlay the pile behind it stays empty, or you would see a fifth card.)
        setGhost(isFour ? [] : shown);
        clearTimeout(ghostTimer.current);
        ghostTimer.current = setTimeout(() => setGhost(null), holdMs);
      }
      if (isFour) {
        // The overlay has its own fire emoji (burn-flash), so the pile flame is skipped.
        setFourBurn(four);
        clearTimeout(fourTimer.current);
        fourTimer.current = setTimeout(() => setFourBurn(null), FOUR_BURN_MS);
      } else if (ev.burned) {
        // The timer lives in a ref, NOT in this effect's cleanup: the effect re-runs on every state
        // push (lastEvent is a new object each time), and a cleanup would cancel the timer and leave
        // the flame on screen for the rest of the game.
        clearTimeout(flameTimer.current);
        flameTimer.current = setTimeout(() => {
          setFlame(true);
          flameTimer.current = setTimeout(() => setFlame(false), 1500);
        }, GHOST_MS);
      }
    };
    // After a face-down card's flip the burn plays out; otherwise at once.
    clearTimeout(burnTimer.current);
    if (delayed) burnTimer.current = setTimeout(showBurn, BLIND_REVEAL_MS);
    else {
      if (outDelayed) {
        const winnerOut = latest.current.finishOrder[0] === ev.playerId;
        burnTimer.current = setTimeout(() => {
          // The fanfare of the game's winner is played here, with the confetti (not in GameScreen).
          if (winnerOut) {
            play(ev.playerId === me ? 'win' : 'score');
            haptic(ev.playerId === me ? 'success' : 'tap');
          } else feedback();
        }, TURN_MS);
      } else if (ev.out && latest.current.finishOrder[0] === ev.playerId) {
        // A last card from hand or face-up: no flip, the fanfare plays at once.
        play(ev.playerId === me ? 'win' : 'score');
        haptic(ev.playerId === me ? 'success' : 'tap');
      } else feedback();
      showBurn();
    }
  }, [view.lastEvent, me]);
  // (after the effect above, so it still holds the pile from before the move when one arrives)
  useEffect(() => {
    prevPile.current = view.pile;
  });
  // (declared after the effect above, so it still sees the previous values when a move arrives)
  useEffect(() => {
    before.current = { deadline: game.deadline };
  });

  // A gentle buzz when ten seconds are left on my turn.
  const warnedFor = useRef<number | null>(null);
  useEffect(() => {
    if (myTurnShown && secondsLeft === 10 && warnedFor.current !== game.deadline) {
      warnedFor.current = game.deadline;
      haptic('tap');
    }
  }, [myTurnShown, secondsLeft, game.deadline]);

  const wasMyTurn = useRef(myTurnShown);
  useEffect(() => {
    if (myTurnShown && !wasMyTurn.current && view.phase === 'play') {
      play('turn');
      haptic('tap');
    }
    wasMyTurn.current = myTurnShown;
  }, [myTurnShown, view.phase]);

  // ---- interactions -------------------------------------------------------------------------

  async function send(move: unknown) {
    // Nothing may be played while a card is still turning over (nor in the beat after it).
    if (busy || reveal || settling) return undefined;
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
      setSwapHand(null);
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
      setSwapUp(null);
    } else {
      haptic('tap');
      setSwapUp(slot);
    }
  }

  /**
   * Play phase, see `planTap`: a rank held several times is selected as a whole set (then press
   * Play); a card held once is tap to select, tap the selected card again to play it.
   */
  function tapCard(card: Card) {
    if (!playing) return;
    if (view.mustPickUp) return flashHint('Tap the pile to pick it up first');
    // Face-up cards can always be tried (a too-low one goes on the pile and you pick it up).
    if (zone !== 'up' && !canPlayRank(pile, rankOf(card))) return;
    const zoneCards = zone === 'hand' ? hand : (mine?.faceUp ?? []).filter((c) => c !== null);
    const plan = planTap({
      zoneCards,
      selected: sel,
      card,
    });
    if (plan.type === 'play') {
      void playSelected(plan.cards, null);
      return;
    }
    haptic('tap');
    setSelDown(null);
    setSel(plan.cards);
  }

  function tapDown(slot: number) {
    if (view.mustPickUp) return flashHint('Tap the pile to pick it up first');
    // Tap selects the face-down card, tapping it again flips it (plays it).
    if (selDown === slot) {
      void playSelected([], slot);
      return;
    }
    haptic('tap');
    setSel([]);
    setSelDown(slot);
  }

  function clearSelection() {
    setSel([]);
    setSelDown(null);
    setSwapHand(null);
    setSwapUp(null);
  }

  function pickUpPile() {
    void send({ type: 'pickup' });
  }

  /** Tap the pile: pick it up when nothing can be played, otherwise look at the last two moves. */
  function tapPile() {
    if (view.phase !== 'play') return flashHint('Nothing to pick up yet');
    if (pile.length === 0) return flashHint('The pile is empty');
    if (mustPickUp && myTurn) return pickUpPile();
    if (reveal || !notes.current) return;
    haptic('tap');
    setSel([]);
    setSelDown(null);
    const r = pileEl.current?.getBoundingClientRect();
    setPeek(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 });
  }

  /** There is no manual drawing in Karma: you refill to three cards after playing. */
  function tapDeck() {
    flashHint('Cards are drawn for you after you play');
  }

  async function playSelected(cards: Card[] = sel, down: number | null = selDown) {
    const res =
      down !== null
        ? await send({ type: 'playDown', index: down })
        : await send({ type: 'play', cards });
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
    hint =
      sel.length > 1
        ? 'Press Play · tap a card to drop it from the set'
        : 'Press Play, or tap the card again to play it';
  }

  // Nothing in my active cards can be played, so picking up is the only move: the player must tap the pile
  // (the pile pulses and one tap takes it). Picking up is never voluntary.
  const activeCards = zone === 'hand' ? hand : zone === 'up' ? (mine?.faceUp ?? []) : [];
  // (Not while a flipped face-down card is still turning over: the pulsing pile would give away that it was too low.)
  const mustPickUp =
    playing &&
    !reveal &&
    pile.length > 0 &&
    (view.mustPickUp ||
      (zone !== 'down' && !activeCards.some((c) => c !== null && canPlayRank(pile, rankOf(c)))));

  const urgent = secondsLeft !== null && secondsLeft <= 10;
  const shownHint =
    flash ??
    (mustPickUp
      ? view.mustPickUp
        ? 'Too low! Tap the pile to pick it up'
        : zone === 'up'
          ? 'Nothing playable: try a face-up card, or tap the pile to pick it up'
          : 'Nothing you can play: tap the pile to pick it up'
      : hint);

  const describe = (n: Note | null) => (n ? describeEvent(n.ev, nameOf, n) : '');

  const endgame = !!mine && view.phase === 'play' && view.stockCount === 0 && hand.length === 0;
  const tableFont = view.phase === 'swap' || endgame ? tableBig : tableBig * 0.62;

  // The game is decided: if I am the one left, my face-down cards are turned over too.
  const myLeft = view.leftovers && view.leftovers.playerId === me ? view.leftovers : null;
  const myPlan = myLeft ? revealPlan(myLeft) : null;
  const opponents = view.players.filter((p) => p.id !== me);
  const finishRank = (id: string) => view.finishOrder.indexOf(id) + 1;
  const selCount = selDown !== null ? 1 : sel.length;

  // The hand fans out: cards overlap but always show at least MIN_VISIBLE of their width
  // (handLayout.ts); when a row would show less, another row is added (each overlapping the one
  // above by half a card).
  const layout = handLayout(hand.length, handWidth, myFont);
  const rowCount = layout.rows;
  const perRow = layout.perRow;
  const handRows = Array.from({ length: rowCount }, (_, r) =>
    hand.slice(r * perRow, (r + 1) * perRow),
  );
  // After a pickup my new cards fly out of the pile one by one (quicker when there are many).
  const flingStep = Math.min(90, 700 / Math.max(1, hand.length));
  const flinging = lastEvent?.playerId === me && lastEvent.kind === 'pickup';
  const handFont = layout.font;
  const cardW = handFont * 5;
  const rowStep = handFont * 7 * 0.5;

  return (
    <CardFlipContext.Provider value={flipContext}>
      <div
        className="flex h-full min-h-0 flex-col"
        data-testid="karma-game"
        data-phase={view.phase}
        // Tapping anywhere that is not a button (cards, Play, Ready, the pile are buttons) deselects.
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) clearSelection();
        }}
      >
        <div className="flex gap-2 px-3 pb-2">
          {opponents.map((p) => (
            <Seat
              key={p.id}
              player={p}
              member={member(p.id)}
              current={p.id === shownTurnId || (view.phase === 'swap' && !p.ready)}
              finishRank={finishRank(p.id)}
              phase={view.phase}
              font={oppFont}
              overlap={opponentCount >= 3}
              beside={opponentCount === 1}
              pickedUp={pickup?.id === p.id ? pickup.n : null}
              leftovers={view.leftovers}
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
              data-testid="pile"
              data-count={pile.length}
              data-must-pick={mustPickUp}
              className={`relative ${mustPickUp ? 'pile-pulse' : ''}`}
              role="button"
              aria-label="Pile: tap to see the last two moves"
              onClick={(e) => {
                e.stopPropagation();
                tapPile();
              }}
              style={{ width: `${pileFont * 6.2}px`, height: `${pileFont * 7}px` }}
            >
              {shownPile.length === 0 ? (
                <div
                  className="absolute left-1/2 top-0 -translate-x-1/2 rounded-[0.55em] border-2 border-dashed border-onbg/40"
                  style={{ width: `${pileFont * 5}px`, height: `${pileFont * 7}px` }}
                />
              ) : (
                shownPile.slice(-3).map((c, i, shown) => {
                  const fromTop = shown.length - 1 - i;
                  return (
                    <PlayingCard
                      key={c}
                      card={c}
                      size={pileFont}
                      tilt={fromTop === 0 ? 0 : fromTop % 2 ? -7 : 6}
                      className="absolute top-0"
                      style={{
                        left: `${pileFont * (1.1 - fromTop * 0.6)}px`,
                      }}
                      testId={fromTop === 0 ? 'pile-top' : undefined}
                      flip={{ id: c, origin: () => pileOrigin(c), ...playFlight(c) }}
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
                {`Pile ${shownPile.length}`}
                {view.burned > 0 && ` · 🔥 ${view.burned}`}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="flex flex-col gap-1.5"
              data-testid="karma-event"
              data-seq={notes.current?.ev.seq ?? ''}
              aria-live="polite"
            >
              <p
                className={`min-h-[1.25em] text-sm font-bold leading-tight ${
                  notes.current?.ev.kind === 'pickup' ? 'text-danger' : 'text-onbg'
                }`}
                data-testid="karma-event-current"
              >
                {notes.current && !reveal && !revealPending
                  ? describeEvent(notes.current.ev, nameOf, notes.current)
                  : ' '}
              </p>
              <p
                className="min-h-[1.25em] text-xs font-medium leading-tight text-onbg/60"
                data-testid="karma-event-previous"
              >
                {notes.previous ? describeEvent(notes.previous.ev, nameOf, notes.previous) : ' '}
              </p>
            </div>
            <p
              className={`mt-2 min-h-[2.4em] text-xs font-semibold leading-snug ${myTurnShown ? 'text-onbg' : 'text-onbg/80'}`}
              data-testid="karma-hint"
              data-my-turn={myTurnShown}
            >
              {shownHint}
            </p>
          </div>
        </div>

        {mine && (
          <div className="border-t-2 border-edge/60 bg-panel px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 text-ink">
            <div className="mx-auto flex max-w-md flex-col gap-1">
              <div className="flex items-stretch gap-2">
                <div className="flex shrink-0 justify-start">
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
                          dimmed:
                            !canPlayRank(pile, rankOf(card)) &&
                            (mine?.faceUp ?? []).some(
                              (c) => c !== null && canPlayRank(pile, rankOf(c)),
                            ),
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
                    revealDown={myLeft?.faceDown}
                    revealAt={myPlan?.down}
                  />
                </div>
                {/* Timer and Play fill all the room the table cards leave (they sit to the left), in
                    a fixed 2 : 3 split so nothing moves between turns. */}
                <div className="flex min-w-[5.5rem] flex-1 flex-col gap-2">
                  {view.phase === 'play' && (
                    <div
                      data-testid="karma-timer"
                      data-my-turn={myTurnShown}
                      data-seconds={secondsLeft}
                      className={`relative flex min-h-0 flex-[2] flex-col items-center justify-center overflow-hidden rounded-lg border-2 px-1 text-center ${
                        urgent ? 'animate-pulse border-danger text-dangertext' : 'border-edge/40'
                      }`}
                    >
                      <TimerDrain
                        active={myTurnShown}
                        deadline={game.deadline}
                        serverTime={room.serverTime}
                        totalSec={room.turnTimeSec}
                        urgent={urgent}
                      />
                      <p className="relative w-full break-words text-xl font-bold uppercase leading-tight tracking-wide">
                        {myTurnShown ? 'Your turn' : nameOf(shownTurnId ?? '').slice(0, 12)}
                      </p>
                    </div>
                  )}
                  {swapping && (
                    <Button
                      data-testid="karma-ready"
                      className="!min-h-0 flex-1 !text-xl !leading-tight"
                      disabled={busy}
                      onClick={() => void getReady()}
                    >
                      Ready
                    </Button>
                  )}
                  {view.phase === 'play' && (
                    <Button
                      data-testid="karma-play"
                      className="!min-h-0 flex-[3] !px-2 !text-xl !leading-tight"
                      disabled={!playing || busy || selCount === 0}
                      onClick={() => void playSelected()}
                    >
                      <span>
                        {selDown !== null
                          ? 'Flip it'
                          : selCount > 0
                            ? `Play ${selCount === 1 ? cardLabel(sel[0] as Card) : `${selCount} cards`}`
                            : 'Play'}
                      </span>
                    </Button>
                  )}
                </div>
              </div>

              {/* overflow-x: clip keeps cards free to fly up out of the row while animating. Rows centre
                  themselves with mx-auto, NOT justify-center (that cuts off the left side when too wide). */}
              <div
                ref={handEl}
                className="flex w-full flex-col px-1 pb-1 pt-4"
                data-testid="my-hand"
                data-rows={rowCount}
                data-dimmed={view.phase === 'play' && !myTurnShown}
                style={{
                  minHeight: `${handFont * 7 + rowStep * (rowCount - 1) + 22}px`,
                  overflowX: 'clip',
                  // Not my turn: my hand dims a little, so it is obvious who is up.
                  filter: view.phase === 'play' && !myTurnShown ? 'brightness(0.3)' : undefined,
                  transition: 'filter 200ms',
                }}
              >
                {handRows.map((row, r) => {
                  const strip = layout.strip;
                  return (
                    <div
                      key={r}
                      className="mx-auto flex items-end"
                      style={{ marginTop: r === 0 ? 0 : `-${rowStep}px` }}
                    >
                      {row.map((c, i) => {
                        const playable = canPlayRank(pile, rankOf(c));
                        return (
                          <PlayingCard
                            key={c}
                            card={c}
                            size={handFont}
                            testId={`hand-card-${c}`}
                            data={{
                              playable: playing && zone === 'hand' && playable,
                              rank: rankOf(c),
                            }}
                            selected={swapping ? swapHand === c : sel.includes(c)}
                            dimmed={playing && zone === 'hand' && !playable}
                            style={{ marginLeft: i === 0 ? 0 : `-${cardW - strip}px` }}
                            flip={{
                              id: c,
                              origin: handOrigin,
                              delay: flinging ? (r * perRow + i) * flingStep : 0,
                            }}
                            onClick={() => (swapping ? tapSwapHand(c) : tapCard(c))}
                          />
                        );
                      })}
                    </div>
                  );
                })}
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

        {peek && (
          <PeekOverlay
            from={peek}
            rows={[
              { label: 'Now', ev: notes.current, text: describe(notes.current) },
              { label: 'Before', ev: notes.previous, text: describe(notes.previous) },
            ]}
            onDone={() => setPeek(null)}
          />
        )}
        {tutorial && <KarmaTutorial onDone={closeTutorial} />}
        {fourBurn && <FourBurn cards={fourBurn} ms={FOUR_BURN_MS} />}
        {reveal && <WinReveal card={reveal.card} label={reveal.label} winner={reveal.winner} />}
      </div>
    </CardFlipContext.Provider>
  );
}
