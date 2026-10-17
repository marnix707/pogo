import { useEffect, useMemo, useRef, useState } from 'react';
import { karma } from '@pogo/shared';
import type { RoomMemberView } from '@pogo/shared';
import { Button } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import type { GameUiProps } from '../types';
import { KarmaRules } from './KarmaRules';
import { CARD_FONT, PlayingCard } from './PlayingCard';
import type { CardSize } from './PlayingCard';

type Card = number;
const { rankOf, suitOf, canPlayRank, activeZone, cardLabel, RANK_LABEL } = karma;

const byRankThenSuit = (a: Card, b: Card) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b);

/** Three columns: a face-down card with a face-up card lying on top of it. */
function TableSlots({
  faceUp,
  faceDown,
  size,
  idPrefix,
  upState,
  downState,
}: {
  faceUp: (Card | null)[];
  faceDown: boolean[];
  size: CardSize;
  idPrefix?: string;
  upState?: (
    card: Card,
    slot: number,
  ) => { onClick?: () => void; selected?: boolean; dimmed?: boolean; playable?: boolean };
  downState?: (slot: number) => { onClick?: () => void; selected?: boolean };
}) {
  const font = CARD_FONT[size];
  const offset = font * 2.4;
  return (
    <div className="flex" style={{ gap: `${font * 0.6}px` }}>
      {[0, 1, 2].map((slot) => {
        const up = faceUp[slot] ?? null;
        const down = faceDown[slot] ?? false;
        const upProps = up !== null ? upState?.(up, slot) : undefined;
        const downProps = down ? downState?.(slot) : undefined;
        return (
          <div
            key={slot}
            className="relative"
            style={{ width: `${font * 5}px`, height: `${font * 7 + offset}px` }}
          >
            {down && (
              <PlayingCard
                faceDown
                size={size}
                className="absolute left-0 top-0"
                testId={idPrefix ? `${idPrefix}-down-${slot}` : undefined}
                onClick={downProps?.onClick}
                selected={downProps?.selected}
              />
            )}
            {up !== null && (
              <PlayingCard
                card={up}
                size={size}
                className="absolute left-0"
                style={{ top: `${offset}px` }}
                testId={idPrefix ? `${idPrefix}-up-${slot}` : undefined}
                onClick={upProps?.onClick}
                selected={upProps?.selected}
                dimmed={upProps?.dimmed}
                data={upProps?.playable === undefined ? undefined : { playable: upProps.playable }}
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
}: {
  player: karma.KarmaPlayerView;
  member?: RoomMemberView;
  current: boolean;
  finishRank: number;
  phase: karma.KarmaPhase;
}) {
  const status = player.out
    ? `Out · #${finishRank}`
    : phase === 'swap'
      ? player.ready
        ? 'Ready ✓'
        : 'Swapping…'
      : `${player.handCount} in hand`;
  return (
    <div
      data-testid={`seat-${player.id}`}
      data-current={current}
      className={`hud flex min-w-0 flex-1 flex-col items-center gap-1 px-1.5 py-1.5 ${
        current ? '!border-accent' : ''
      } ${player.out ? 'opacity-60' : ''} ${member && !member.connected ? 'grayscale' : ''}`}
    >
      <div className="flex w-full items-center justify-center gap-1">
        <span className="text-sm" aria-hidden>
          {avatarEmoji(member?.avatar ?? '')}
        </span>
        <span className="label truncate text-[9px]">{member?.nickname ?? '?'}</span>
      </div>
      <TableSlots faceUp={player.faceUp} faceDown={player.faceDown} size="xs" />
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

  const zone = mine ? activeZone(mine) : 'none';
  const pile = view.pile;
  const top = pile[pile.length - 1];
  const hand = useMemo(() => [...(mine?.hand ?? [])].sort(byRankThenSuit), [mine?.hand]);
  const swapping = view.phase === 'swap' && !!mine && !mine.ready;
  const playing = view.phase === 'play' && myTurn;

  // A new move happened: forget selections and narrate it (sound, buzz, burn flash).
  const lastSeq = useRef(view.lastEvent?.seq ?? 0);
  useEffect(() => {
    setSel([]);
    setSelDown(null);
    const ev = view.lastEvent;
    if (!ev || ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;
    play(ev.burned ? 'score' : ev.pickedUp > 0 ? 'error' : 'tap');
    if (ev.playerId === me) haptic(ev.burned ? 'success' : ev.pickedUp > 0 ? 'error' : 'tap');
    if (ev.burned) {
      setFlame(true);
      const t = setTimeout(() => setFlame(false), 1500);
      return () => clearTimeout(t);
    }
  }, [view.lastEvent, me]);

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

  function tapSwapHand(card: Card) {
    if (swapUp !== null) {
      void send({ type: 'swap', hand: card, up: swapUp });
      setSwapUp(null);
      setSwapHand(null);
    } else {
      setSwapHand(swapHand === card ? null : card);
    }
  }

  function tapSwapUp(slot: number) {
    if (swapHand !== null) {
      void send({ type: 'swap', hand: swapHand, up: slot });
      setSwapUp(null);
      setSwapHand(null);
    } else {
      setSwapUp(swapUp === slot ? null : slot);
    }
  }

  function tapCard(card: Card) {
    if (!playing || !canPlayRank(pile, rankOf(card))) return;
    haptic('tap');
    setSelDown(null);
    setSel((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      return prev.length > 0 && rankOf(prev[0] as Card) === rankOf(card) ? [...prev, card] : [card];
    });
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
  else if (swapping) hint = 'Tap a hand card and a face-up card to swap them, then press Ready';
  else if (view.phase === 'swap') hint = 'Waiting for the others to get ready…';
  else if (myTurn) {
    if (zone === 'down') hint = 'Pick a face-down card… blind!';
    else if (top === undefined) hint = 'The pile is empty: lead with anything';
    else if (rankOf(top) === 2) hint = 'A 2 is on top: play anything';
    else hint = `Play ${RANK_LABEL[rankOf(top)]} or higher, a 2 or a 10, or pick up`;
  } else if (currentId) {
    hint = `${nameOf(currentId)} ${currentId === me ? 'are' : 'is'} playing…`;
  }

  const opponents = view.players.filter((p) => p.id !== me);
  const finishRank = (id: string) => view.finishOrder.indexOf(id) + 1;
  const selCount = selDown !== null ? 1 : sel.length;
  const cardsPlayable = zone === 'hand' || zone === 'up';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="karma-game" data-phase={view.phase}>
      <div className="flex gap-2 px-3 pb-2">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            player={p}
            member={member(p.id)}
            current={p.id === currentId || (view.phase === 'swap' && !p.ready)}
            finishRank={finishRank(p.id)}
            phase={view.phase}
          />
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4">
        <button
          onClick={() => setRulesOpen(true)}
          aria-label="Rules"
          className="label absolute right-4 top-0 rounded-md border-2 border-onbg/40 px-2 py-1 text-[10px] text-onbg"
        >
          Rules ?
        </button>

        <div className="flex items-center gap-7">
          <div className="relative" data-testid="stock" data-count={view.stockCount}>
            {view.stockCount > 0 ? (
              <PlayingCard faceDown size="md" />
            ) : (
              <div
                className="rounded-[0.55em] border-2 border-dashed border-onbg/40"
                style={{ width: `${CARD_FONT.md * 5}px`, height: `${CARD_FONT.md * 7}px` }}
              />
            )}
            <span className="label absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-onbg">
              Deck {view.stockCount}
            </span>
          </div>

          <div
            className="relative"
            data-testid="pile"
            data-count={pile.length}
            style={{ width: `${CARD_FONT.lg * 7}px`, height: `${CARD_FONT.lg * 7}px` }}
          >
            {pile.length === 0 ? (
              <div
                className="absolute left-1/2 top-0 -translate-x-1/2 rounded-[0.55em] border-2 border-dashed border-onbg/40"
                style={{ width: `${CARD_FONT.lg * 5}px`, height: `${CARD_FONT.lg * 7}px` }}
              />
            ) : (
              pile.slice(-3).map((c, i, shown) => {
                const fromTop = shown.length - 1 - i;
                return (
                  <PlayingCard
                    key={c}
                    card={c}
                    size="lg"
                    className={`absolute top-0 ${fromTop === 0 ? 'animate-pop' : ''}`}
                    style={{
                      left: `${CARD_FONT.lg * (1 - fromTop * 0.55)}px`,
                      transform: `rotate(${fromTop === 0 ? 0 : fromTop % 2 ? -7 : 6}deg)`,
                    }}
                    testId={fromTop === 0 ? 'pile-top' : undefined}
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
              Pile {pile.length}
              {view.burned > 0 && ` · 🔥 ${view.burned}`}
            </span>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p
            className="label min-h-4 text-[10px] text-onbg/80"
            data-testid="karma-event"
            aria-live="polite"
          >
            {view.lastEvent ? describeEvent(view.lastEvent, nameOf) : ' '}
          </p>
          <p
            className={`mt-1 text-sm font-semibold ${myTurn ? 'text-onbg' : 'text-onbg/80'}`}
            data-testid="karma-hint"
            data-my-turn={myTurn}
          >
            {hint}
          </p>
        </div>
      </div>

      {mine && !finished && (
        <div className="border-t-2 border-edge/60 bg-panel px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 text-ink">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2">
            <TableSlots
              faceUp={mine.faceUp}
              faceDown={mine.faceDown}
              size="md"
              idPrefix="my"
              upState={(card, slot) => {
                if (swapping) return { onClick: () => tapSwapUp(slot), selected: swapUp === slot };
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
                  ? {
                      onClick: () => {
                        haptic('tap');
                        setSelDown(selDown === slot ? null : slot);
                      },
                      selected: selDown === slot,
                    }
                  : {}
              }
            />

            <div
              className="flex w-full items-end overflow-x-auto px-1 pb-1 pt-4"
              data-testid="my-hand"
              style={{ minHeight: `${CARD_FONT.md * 7 + 28}px` }}
            >
              <div className="mx-auto flex items-end">
                {hand.map((c, i) => {
                  const playable = canPlayRank(pile, rankOf(c));
                  return (
                    <PlayingCard
                      key={c}
                      card={c}
                      size="md"
                      testId={`hand-card-${c}`}
                      data={{ playable: playing && zone === 'hand' && playable, rank: rankOf(c) }}
                      selected={swapping ? swapHand === c : sel.includes(c)}
                      dimmed={playing && zone === 'hand' && !playable}
                      style={{ marginLeft: i === 0 ? 0 : `-${CARD_FONT.md * 2.55}px` }}
                      onClick={() => (swapping ? tapSwapHand(c) : tapCard(c))}
                    />
                  );
                })}
              </div>
            </div>

            {swapping && (
              <Button
                data-testid="karma-ready"
                className="min-h-11 w-full"
                disabled={busy}
                onClick={() => void send({ type: 'ready' })}
              >
                Ready
              </Button>
            )}
            {view.phase === 'swap' && mine.ready && (
              <p className="label flex min-h-11 items-center text-[11px] text-muted">
                You are ready. Waiting for the others…
              </p>
            )}
            {playing && (
              <div className="flex w-full gap-3">
                <Button
                  data-testid="karma-pickup"
                  variant="secondary"
                  className="min-h-11 flex-1 !px-3"
                  disabled={busy || pile.length === 0}
                  onClick={() => void send({ type: 'pickup' })}
                >
                  Pick up ({pile.length})
                </Button>
                <Button
                  data-testid="karma-play"
                  className="min-h-11 flex-1 !px-3"
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
              </div>
            )}
            {view.phase === 'play' && !myTurn && (
              <p className="label flex min-h-11 items-center text-[11px] text-muted">
                {currentId ? `${nameOf(currentId)}'s turn` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      <KarmaRules open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
