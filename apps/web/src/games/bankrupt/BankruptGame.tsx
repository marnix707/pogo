import { useEffect, useMemo, useRef, useState } from 'react';
import { bankrupt } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { Board, money, seatColour } from './Board';
import { BuyOverlay } from './BuyOverlay';
import { LuckCard } from './LuckCard';
import { TradePanel, pulsingTiles } from './TradePanel';
import { TileSheet } from './TileSheet';
import { useCashFx } from './useCashFx';
import { useCountdown } from '../../lib/useCountdown';
import { dieUrl } from './art';
import { cityArt } from './cityArt';

type State = bankrupt.BankruptState;

/** What the last move did, in words (the line in the middle of the board). */
function describe(s: State, name: (id: string) => string): string {
  const tile = (id: string) => s.board.tiles.find((t) => t.id === id)?.name ?? id;
  const parts: string[] = [];
  for (const e of s.events) {
    if (e.k === 'roll') parts.push(`${name(e.by)} rolled ${e.dice}`);
    else if (e.k === 'salary') parts.push(`${name(e.by)} passed Start: +${money(e.amount)}`);
    else if (e.k === 'rent') parts.push(`${name(e.by)} paid ${name(e.to)} ${money(e.amount)} rent`);
    else if (e.k === 'buy') parts.push(`${name(e.by)} bought ${tile(e.tile)}`);
    else if (e.k === 'card') parts.push(e.text);
    else if (e.k === 'jail') parts.push(`${name(e.by)} went to jail`);
    else if (e.k === 'free') parts.push(`${name(e.by)} is out of jail`);
    else if (e.k === 'build') parts.push(`${name(e.by)} built on ${tile(e.tile)}`);
    else if (e.k === 'sold') parts.push(`${name(e.by)} sold ${tile(e.tile)}`);
    else if (e.k === 'auction')
      parts.push(
        e.winner
          ? `${name(e.winner)} won ${tile(e.tile)} for ${money(e.amount)}`
          : `${tile(e.tile)} was not sold`,
      );
    else if (e.k === 'trade')
      parts.push(
        `${name(e.by)} and ${name(e.with)} traded ${tile(e.give)} for ${tile(e.take)}: +${money(e.bonus)} each`,
      );
    else if (e.k === 'tradeEnd') parts.push(`${name(e.by)} did not trade`);
    else if (e.k === 'bankrupt') parts.push(`${name(e.by)} is bankrupt!`);
  }
  return parts.join(' · ');
}

type CardEvent = Extract<bankrupt.BankruptEvent, { k: 'card' }>;
const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Where each token is drawn: it walks to its new space one step at a time (after the die has rolled). When the
 * move drew a luck card the token stops on the card space, the card slides in for CARD_SHOW_MS and slides away,
 * and only then does what it says happen on screen (a further walk, jail, the payments).
 */
function useWalking(state: State) {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.pos])),
  );
  const seenSeq = useRef(state.seq);
  const [rolling, setRolling] = useState(false);
  const rollTimer = useRef<ReturnType<typeof setTimeout>>();
  const n = state.board.tiles.length;
  // The luck card of the move on screen: wait (for the walk), in, hold, out; 'done' = nothing pending.
  const [card, setCard] = useState<{ ev: CardEvent; phase: 'wait' | 'in' | 'out' } | null>(null);
  const [hold, setHold] = useState<Record<string, number> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef(state);
  latest.current = state;
  const target = (p: State['players'][number]) => hold?.[p.id] ?? p.pos;

  // A new move: the die tumbles first, then the tokens walk.
  useEffect(() => {
    if (seenSeq.current === state.seq) return;
    seenSeq.current = state.seq;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const rolled = state.events.some((e) => e.k === 'roll');
    const cardAt = state.events.findIndex((e) => e.k === 'card');
    if (cardAt >= 0) {
      const ev = state.events[cardAt] as CardEvent;
      const before = state.events.slice(0, cardAt).filter((e) => e.k === 'move' && e.by === ev.by);
      const stop = (before.at(-1) as { to: number } | undefined)?.to;
      if (stop !== undefined) {
        setHold({ [ev.by]: stop });
        setCard({ ev, phase: 'wait' });
      }
    } else {
      setHold(null);
      setCard(null);
      const jailed = new Set(state.events.flatMap((e) => (e.k === 'jail' ? [e.by] : [])));
      if (jailed.size > 0)
        setShown((cur) => ({
          ...cur,
          ...Object.fromEntries(
            [...jailed].map((id) => [id, state.players.find((p) => p.id === id)!.pos]),
          ),
        }));
    }
    if (!rolled) return;
    setRolling(true);
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRolling(false), bankrupt.ROLL_MS);
  }, [state]);
  // (The timer must outlive the next state push, so it is only cleared when the screen goes away.)
  useEffect(
    () => () => {
      clearTimeout(rollTimer.current);
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    if (rolling) return;
    const behind = state.players.filter((p) => (shown[p.id] ?? p.pos) !== target(p));
    if (behind.length === 0) return;
    const t = setTimeout(
      () =>
        setShown((cur) => {
          const next = { ...cur };
          for (const p of behind) {
            const at = cur[p.id] ?? p.pos;
            const goal = target(p);
            const steps = (goal - at + n) % n;
            next[p.id] = steps > n / 2 ? goal : (at + 1) % n;
            if (next[p.id] === 0 || steps === 1) play('tap');
          }
          return next;
        }),
      bankrupt.STEP_MS,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, shown, rolling, n, hold]);
  const walked = !rolling && state.players.every((p) => (shown[p.id] ?? p.pos) === target(p));

  // The token stands on the card space: the card slides in, stays, slides away, then the effect is shown.
  useEffect(() => {
    if (!card || card.phase !== 'wait' || !walked) return;
    const slide = reduced() ? 0 : bankrupt.CARD_SLIDE_MS;
    const show = reduced() ? 1200 : bankrupt.CARD_SHOW_MS;
    setCard({ ev: card.ev, phase: 'in' });
    play('turn');
    timers.current.push(
      setTimeout(() => setCard((c) => (c ? { ...c, phase: 'out' } : c)), slide + show),
      setTimeout(
        () => {
          // Gone: now the card does what it says (walk on, jail, payments).
          const now = latest.current;
          const jailed = new Set(now.events.flatMap((e) => (e.k === 'jail' ? [e.by] : [])));
          setHold(null);
          setCard(null);
          if (jailed.size > 0)
            setShown((cur) => ({
              ...cur,
              ...Object.fromEntries(
                [...jailed].map((id) => [id, now.players.find((p) => p.id === id)!.pos]),
              ),
            }));
        },
        slide + show + slide,
      ),
    );
  }, [card, walked]);
  const cardBusy = card !== null;
  return { shown, rolling, settled: walked && !cardBusy, card, cardBusy };
}

export function BankruptGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const state = game.view as State;
  const players = state.players;
  const mePlayer = players.find((p) => p.id === me);
  const mover = players[state.turn]!;
  const nickOf = (id: string) => room.members.find((m) => m.id === id);
  const name = (id: string) => nickOf(id)?.nickname ?? 'Player';
  const { shown, rolling, settled, card, cardBusy } = useWalking(state);
  const { shown: cashShown, playing: paying } = useCashFx(state, settled);
  void cardBusy;
  // Nobody acts while the last player's token is still walking, the die tumbles or a payment is on show.
  const animating = !settled || paying;
  // The die tumbles through random faces while it rolls.
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(t);
  }, [rolling]);
  const [tileOpen, setTileOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const finished = state.phase === 'over';
  const pulse = pulsingTiles(state, me);
  // The space chosen for a trade, waiting for the confirmation (nothing is sent by a tap on the board).
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (pick && !pulse.has(pick)) setPick(null);
  }, [pick, pulse]);
  const myTurn = !room.spectating && mover.id === me && !finished && !mePlayer?.bankrupt;
  const canAct = !!mePlayer && !mePlayer.bankrupt && !finished;

  const send = async (move: bankrupt.BankruptMove) => {
    if (busy) return;
    setBusy(true);
    haptic('tap');
    try {
      await sendMove(move);
    } finally {
      setBusy(false);
    }
  };

  const note = useMemo(
    () =>
      describe(
        cardBusy
          ? {
              ...state,
              events: state.events.slice(
                0,
                state.events.findIndex((e) => e.k === 'card'),
              ),
            }
          : state,
        name,
      ),
    [state, room.members, cardBusy], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const here = state.board.tiles[mover.pos]!;
  const owedBuy = state.phase === 'buy' && myTurn && bankrupt.isOwnable(here) ? here : null;
  // Cannot pay for it: no card, just "Not enough money" and the game goes on at once (it is passed for me).
  const broke = !!owedBuy && (mePlayer?.cash ?? 0) < owedBuy.price;
  const [shortMsg, setShortMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!broke || !settled || !owedBuy) return;
    setShortMsg(`Not enough money for ${owedBuy.name}`);
    const pass = setTimeout(() => void sendMove({ type: 'decline' }), 1100);
    const gone = setTimeout(() => setShortMsg(null), 1500);
    return () => {
      clearTimeout(pass);
      clearTimeout(gone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broke, settled, owedBuy?.id, state.seq]);
  const goal =
    state.options.target > 0
      ? `${money(state.options.target)} net worth to win`
      : 'Richest player wins';
  const limit =
    state.options.turns > 0
      ? ` · round ${state.round}/${state.options.turns}`
      : ` · round ${state.round}`;

  const tag = (p: State['players'][number], seat: number) => {
    const cash = cashShown[p.id] ?? p.cash;
    // The green number follows the cash while a payment is still being shown.
    const worth = bankrupt.netWorth(state, p.id) - (p.cash - cash);
    const isMover = p.id === mover.id && !finished;
    return (
      <div
        key={p.id}
        data-testid={`bk-player-${p.id}`}
        data-turn={isMover}
        className={`relative flex w-[calc(33.333%-0.17rem)] min-w-0 shrink-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 ${
          isMover ? 'bg-neon/25 ring-2 ring-neon' : ''
        } ${p.bankrupt ? 'opacity-40 grayscale' : ''}`}
      >
        <div className="flex items-center gap-1">
          <img
            src={cityArt(`token-${seatColour(seat)}`)}
            alt=""
            className="h-6 w-auto"
            style={{ imageRendering: 'pixelated' }}
          />
          <Avatar avatar={nickOf(p.id)?.avatar ?? 'fox'} size="sm" />
        </div>
        <span className="max-w-full truncate text-xs font-bold text-onbg">
          <PlayerName name={name(p.id)} id={p.id} me={me} />
        </span>
        <button
          type="button"
          className="text-sm font-bold tabular-nums"
          data-testid={`bk-cash-${p.id}`}
          onClick={() => setTip(tip === `cash-${p.id}` ? null : `cash-${p.id}`)}
        >
          <span className={cash < 0 ? 'text-[#ff8f73]' : 'text-onbg'}>{money(cash)}</span>{' '}
          <span className="text-[#7ee08c]" data-testid={`bk-networth-${p.id}`}>
            ({money(worth)})
          </span>
        </button>
        {p.jail > 0 && <span className="label text-[9px] text-onbg/80">in jail · {p.jail}</span>}
        {p.bankrupt && <span className="label text-[9px] text-[#ff8f73]">bankrupt</span>}
        {tip === `cash-${p.id}` && (
          <span
            role="status"
            className="absolute top-full z-20 mt-1 w-48 rounded-md border-2 border-edge/40 bg-panel2 px-2 py-1.5 text-left text-xs font-normal normal-case text-ink shadow-lg"
          >
            {p.cash < 0 ? (
              <>
                <b className="text-[#ff8f73]">Careful:</b> below {money(state.board.bankruptBelow)}{' '}
                you are bankrupt.{' '}
              </>
            ) : null}
            <span className="text-[#7ee08c]">Green = net worth</span>: cash plus what your spaces
            and buildings sell for.
          </span>
        )}
      </div>
    );
  };
  // Like the card games: with up to four players I sit bottom centre, with five or six bottom left, the others follow clockwise round the board. With up to four
  // players everybody else is on top (left to right = turn order); with more, the extra ones sit next to me on
  // the bottom row (clockwise runs right to left along the bottom, so the one who plays just before me is
  // right next to me). A watcher sees the first seat at the bottom left.
  const meIdx = Math.max(
    0,
    players.findIndex((p) => p.id === me),
  );
  const around = players.map((_, i) => (meIdx + i) % players.length);
  const others = around.slice(1);
  const topSeats = others.slice(0, 3);
  const bottomSeats = [around[0]!, ...others.slice(3).reverse()];

  return (
    <div
      className="flex h-full flex-col gap-1 overflow-y-auto px-3 pb-3"
      data-testid="bankrupt-game"
      data-phase={state.phase}
      data-seq={state.seq}
    >
      <p className="label text-center text-onbg" data-testid="bk-goal">
        <span className="text-[#7ee08c]">{goal.split(' ')[0]}</span>{' '}
        {goal.split(' ').slice(1).join(' ')}
        <span className="text-onbg/70">{limit}</span>
      </p>
      <div className="flex justify-center gap-1" data-testid="bk-seats-top">
        {topSeats.map((i) => tag(players[i]!, i))}
      </div>

      <Board
        state={state}
        shown={shown}
        onTile={setTileOpen}
        pulse={pulse}
        picked={pick}
        onPulse={(id) => setPick(id === pick ? null : id)}
      >
        <div className="flex h-[11cqw] items-center" data-testid="bk-dice">
          {(state.dice ?? 0) > 0 || rolling ? (
            <img
              src={dieUrl(rolling ? face : state.dice!)}
              alt={rolling ? 'rolling' : `die ${state.dice}`}
              data-testid="bk-die"
              data-value={rolling ? 0 : state.dice}
              className={`h-[11cqw] w-[11cqw] ${rolling ? 'bk-tumble' : ''}`}
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
        </div>
        <p
          className="line-clamp-3 max-w-full px-1 text-center text-[2.4cqw] font-bold leading-none text-[#f7f1e4] [text-shadow:0_1px_0_#101628]"
          data-testid="bk-note"
          role="status"
        >
          {finished
            ? 'Game over'
            : note ||
              (room.spectating
                ? `${name(mover.id)} to play`
                : myTurn
                  ? 'Your turn'
                  : `${name(mover.id)} to play`)}
        </p>
      </Board>

      <div
        className={`flex gap-1 ${bottomSeats.length === 1 ? 'justify-center' : 'justify-start'}`}
        data-testid="bk-seats-bottom"
      >
        {bottomSeats.map((i) => tag(players[i]!, i))}
      </div>

      {/* What I can do right now. */}
      <div className="hud calm flex flex-col gap-2 p-3" data-testid="bk-actions">
        {room.spectating || !canAct ? (
          <p className="label text-center text-onbg/80">
            {room.spectating
              ? 'Watching the game'
              : mePlayer?.bankrupt
                ? 'You are out of the game'
                : ''}
          </p>
        ) : state.trade ? (
          <TradePanel
            state={state}
            me={me}
            name={name}
            send={send}
            busy={busy}
            deadline={game.deadline}
            serverTime={room.serverTime}
            open={setTileOpen}
            pick={pick}
            onClearPick={() => setPick(null)}
          />
        ) : state.auction ? (
          <AuctionPanel
            state={state}
            me={me}
            name={name}
            send={send}
            busy={busy}
            deadline={game.deadline}
            serverTime={room.serverTime}
          />
        ) : !myTurn ? (
          <p className="label text-center text-onbg/80" data-testid="bk-wait">
            Waiting for {name(mover.id)}…
          </p>
        ) : state.phase === 'buy' && owedBuy ? (
          <p className="label text-center text-onbg/80" data-testid="bk-buy-hint">
            {broke ? 'Not enough money' : settled ? '' : 'Walking…'}
          </p>
        ) : mePlayer!.jail > 0 && state.phase === 'roll' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="gold"
              data-testid="bk-pay-jail"
              disabled={busy || animating || mePlayer!.cash < state.board.jailFee}
              onClick={() => void send({ type: 'payJail' })}
            >
              Pay {money(state.board.jailFee)}
            </Button>
            <Button
              variant="secondary"
              data-testid="bk-wait-jail"
              disabled={busy || animating}
              onClick={() => void send({ type: 'wait' })}
            >
              Wait ({mePlayer!.jail})
            </Button>
          </div>
        ) : state.phase === 'roll' ? (
          <Button
            variant="gold"
            data-testid="bk-roll"
            disabled={busy || rolling || animating}
            onClick={() => void send({ type: 'roll' })}
          >
            Roll the dice
          </Button>
        ) : (
          <p className="label text-center text-onbg/80">…</p>
        )}
        {mePlayer && mePlayer.cash < 0 && !mePlayer.bankrupt && (
          <p className="label text-center text-[10px] text-[#ff8f73]" data-testid="bk-warning">
            You are in debt. Below {money(state.board.bankruptBelow)} you are bankrupt: tap a space
            to sell.
          </p>
        )}
      </div>

      {card && card.phase !== 'wait' && (
        <LuckCard
          kind={card.ev.kind}
          textLine={card.ev.text}
          who={card.ev.by}
          whoName={name(card.ev.by)}
          phase={card.phase === 'in' ? 'in' : 'out'}
        />
      )}
      {shortMsg && (
        <p
          role="status"
          data-testid="bk-not-enough"
          className="label pointer-events-none fixed inset-x-0 top-1/3 z-40 mx-auto w-fit rounded-md border-2 border-[#101628] bg-[#ff6b57] px-3 py-2 text-center text-sm text-white shadow-[0_4px_0_0_#101628]"
        >
          {shortMsg}
        </p>
      )}
      {owedBuy && settled && !broke && (
        <BuyOverlay state={state} me={me} tile={owedBuy} busy={busy} send={send} />
      )}
      <TileSheet
        state={state}
        me={me}
        tileId={tileOpen}
        canAct={myTurn && !state.auction && !state.trade && state.phase !== 'buy'}
        send={send}
        name={name}
        onClose={() => setTileOpen(null)}
      />
    </div>
  );
}

/** The auction in the action area: the space, the highest bid and quick bids. */
function AuctionPanel({
  state,
  me,
  name,
  send,
  busy,
  deadline,
  serverTime,
}: {
  state: State;
  me: string;
  name: (id: string) => string;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  busy: boolean;
  deadline: number | null;
  serverTime: number;
}) {
  const a = state.auction!;
  const tile = state.board.tiles.find((t) => t.id === a.tile);
  const price = tile && bankrupt.isOwnable(tile) ? tile.price : 100;
  const cash = state.players.find((p) => p.id === me)?.cash ?? 0;
  const step = Math.max(bankrupt.MIN_BID, Math.round((price * 0.1) / 5) * 5);
  const base = a.high?.amount ?? a.min - step;
  const leading = a.high?.player === me;
  const passed = a.passed.includes(me);
  const left = useCountdown(deadline, serverTime);
  // Out of the bidding (stepped out, or not enough money to top the highest bid): the prices are greyed out.
  const out = passed || (!leading && cash <= Math.max(a.min - 1, a.high?.amount ?? 0));
  return (
    <div className="flex flex-col gap-2" data-testid="bk-auction">
      <p className="label text-center">
        Auction:{' '}
        <b
          className={tile?.kind === 'property' ? '' : 'text-neon'}
          style={tile?.kind === 'property' ? { color: tile.color } : undefined}
          data-testid="bk-auction-name"
        >
          {tile?.name}
        </b>
        {left !== null && (
          <span
            className={`ml-2 tabular-nums ${left <= 5 ? 'text-[#ff8f73]' : 'text-onbg/80'}`}
            data-testid="bk-auction-timer"
          >
            {left}s
          </span>
        )}
      </p>
      <p className="text-center text-sm" data-testid="bk-high-bid">
        {a.high
          ? `Highest bid ${money(a.high.amount)} by ${name(a.high.player)}`
          : `No bids yet · opens at ${money(a.min)}`}
      </p>
      <>
        {leading ? (
          <p className="label text-center text-[#7ee08c]">You have the highest bid</p>
        ) : out ? (
          <p className="label text-center text-onbg/80" data-testid="bk-stepped-out">
            {passed ? 'You stepped out' : 'You cannot top that bid: you step out'}
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 5].map((k) => {
            const amount = base + k * step;
            const off = busy || leading || out || amount > cash;
            return (
              <Button
                key={k}
                variant="gold"
                data-testid={`bk-bid-${k}`}
                className={`!px-1 ${off ? 'grayscale' : ''}`}
                disabled={off}
                onClick={() => void send({ type: 'bid', amount })}
              >
                {money(amount)}
              </Button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          data-testid="bk-pass"
          disabled={busy || leading || passed}
          onClick={() => void send({ type: 'passBid' })}
        >
          Pass
        </Button>
      </>
    </div>
  );
}
