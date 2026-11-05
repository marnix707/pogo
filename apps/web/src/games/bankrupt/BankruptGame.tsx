import { useEffect, useMemo, useRef, useState } from 'react';
import { bankrupt } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { Board, money, playerColour } from './Board';
import { BuyOverlay } from './BuyOverlay';
import { LuckCard } from './LuckCard';
import { LockIcon } from '../../components/icons';
import { AuctionPanel } from './AuctionPanel';
import { EndBanner } from './EndBanner';
import { RainbowRoad } from './RainbowRoad';
import { TradePanel, TradeSwap, pulsingTiles } from './TradePanel';
import { TileSheet } from './TileSheet';
import { useCashFx } from './useCashFx';
import { PixelText, labelWidth } from './PixelLabel';
import type { Part } from './PixelLabel';
import { measure, pixelSafe } from './pixel-text/pixelText';
import { CARD_W, SCREEN_H, SCREEN_W, rowXs, screenArt } from './screenArt';
import { useStageScale } from './useStage';

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
    else if (e.k === 'jailSkip') parts.push(`${name(e.by)} sits out in jail (${e.left} to go)`);
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
            // Always walk, by the shorter way round (a token sent to jail walks there too).
            next[p.id] = steps <= n / 2 ? (at + 1) % n : (at - 1 + n) % n;
            if (next[p.id] === 0 || next[p.id] === goal) play('tap');
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
          // Gone: now the card does what it says (walk on, walk to jail, the payments).
          setHold(null);
          setCard(null);
        },
        slide + show + slide,
      ),
    );
  }, [card, walked]);
  const cardBusy = card !== null;
  return { shown, rolling, settled: walked && !cardBusy, card, cardBusy };
}

export function BankruptGame({ room, me, sendMove, chrome }: GameUiProps) {
  const game = room.game!;
  // Moves are played out one after another: when the next one arrives while the last is still being shown (a
  // computer answers fast), it waits in a queue, so no token stops short and nobody hops before the walk is done.
  const latest = game.view as State;
  const [state, setState] = useState(latest);
  const [queue, setQueue] = useState<State[]>([]);
  const lastSeq = useRef(latest.seq);
  useEffect(() => {
    if (latest.seq === lastSeq.current) return;
    lastSeq.current = latest.seq;
    // (a new game, or far behind after a reconnect: no point in replaying every move)
    if (latest.seq < state.seq) setState(latest);
    else setQueue((q) => (q.length >= 3 ? [latest] : [...q, latest]));
  }, [latest]); // eslint-disable-line react-hooks/exhaustive-deps
  const players = state.players;
  const mePlayer = players.find((p) => p.id === me);
  const mover = players[state.turn]!;
  const nickOf = (id: string) => room.members.find((m) => m.id === id);
  const name = (id: string) => nickOf(id)?.nickname ?? 'Player';
  const { shown, rolling, settled, card, cardBusy } = useWalking(state);
  const { shown: cashShown, playing: paying } = useCashFx(state, settled);
  void cardBusy;
  // Nobody acts while the last player's token is still walking, the die tumbles or a payment is on show.
  // (`fresh`: a new move has just arrived and the hooks above have not started its animations yet: there is
  // no instant in between where the buttons work.)
  const [doneSeq, setDoneSeq] = useState(state.seq);
  useEffect(() => setDoneSeq(state.seq), [state.seq]);
  const fresh = doneSeq !== state.seq;
  const animating = fresh || !settled || paying || queue.length > 0;
  useEffect(() => {
    if (queue.length === 0 || fresh || !settled || paying) return;
    setState(queue[0]!);
    setQueue((q) => q.slice(1));
  }, [queue, fresh, settled, paying]);
  // The cell door shuts once the token has arrived in jail (when it is sent there, not when it passes by).
  const jailSounded = useRef(state.seq);
  useEffect(() => {
    if (animating || jailSounded.current === state.seq) return;
    jailSounded.current = state.seq;
    if (state.events.some((e) => e.k === 'jail')) play('jail');
  }, [animating, state]);
  // The board shows the position as it was before this move until the move has been played out (no spoilers:
  // who owns the space the token is walking to, what got built, who is in jail ...).
  const [seen, setSeen] = useState(state);
  useEffect(() => {
    if (!animating) setSeen(state);
  }, [animating, state]);
  const ui = animating ? seen : state;
  // The die tumbles through random faces while it rolls.
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 60);
    return () => clearInterval(t);
  }, [rolling]);
  const [tileOpen, setTileOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const finished = state.phase === 'over';
  // (the trade starts only when everything before it has been played out: walk, card, payments)
  const tradeOn = !!state.trade && !animating;
  const auctionOn = !!state.auction && !animating;
  const pulse = tradeOn ? pulsingTiles(state, me) : new Set<string>();
  // The space chosen for a trade, waiting for the confirmation (nothing is sent by a tap on the board).
  const [pick, setPick] = useState<string | null>(null);
  const pickStillValid = !pick || pulse.has(pick);
  useEffect(() => {
    if (!pickStillValid) setPick(null);
  }, [pickStillValid]);
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

  // The lock next to Roll: rolls for me, turn after turn, until something needs a choice (a space to buy, the
  // jail question, an auction, a trade ...: none of those is the roll phase, so it simply waits).
  const [autoRoll, setAutoRoll] = useState(false);
  useEffect(() => {
    if (!autoRoll || !myTurn || state.phase !== 'roll' || animating || busy || rolling) return;
    const t = setTimeout(() => void send({ type: 'roll' }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoll, myTurn, state.phase, state.seq, animating, busy, rolling]);

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
  const broke =
    !!owedBuy && (mePlayer?.cash ?? 0) < owedBuy.price && !bankrupt.rainbowRoad(state, me);
  const [shortMsg, setShortMsg] = useState<string | null>(null);
  useEffect(() => {
    // (Nothing to say any more: the note goes away with the situation, it can never get stuck.)
    if (!broke || !settled || fresh || !owedBuy) {
      setShortMsg(null);
      return;
    }
    setShortMsg(`Not enough money for ${owedBuy.name}`);
    const pass = setTimeout(() => void sendMove({ type: 'decline' }), 1100);
    const gone = setTimeout(() => setShortMsg(null), 1500);
    return () => {
      clearTimeout(pass);
      clearTimeout(gone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broke, settled, fresh, owedBuy?.id]);
  const goalParts: Part[] = [
    {
      text:
        state.options.target > 0
          ? `${money(state.options.target)} net worth to win`
          : 'Richest player wins',
      colour: '#74cca8',
    },
    {
      text:
        state.options.turns > 0
          ? ` · round ${state.round}/${state.options.turns}`
          : ` · round ${state.round}`,
      colour: '#f7f1e4',
      gap: 2,
    },
  ];

  // The screen is 290 x 432 art pixels at a whole number of device pixels each: positions are in art pixels.
  const root = useRef<HTMLDivElement>(null);
  const s = useStageScale(root);
  const A = (n: number) => n * s;
  const jailOn = myTurn && state.phase === 'jailAsk' && !animating;

  const tag = (latestP: State['players'][number], left: number, top: number) => {
    // (what is shown follows the board: jail / bankrupt only show once the move is played out)
    const p = ui.players.find((q) => q.id === latestP.id) ?? latestP;
    const cash = cashShown[p.id] ?? p.cash;
    // The green number follows the cash while a payment is still being shown.
    // (spaces and buildings as the board shows them; the cash as it counts)
    const worth = p.bankrupt ? 0 : bankrupt.netWorth(ui, p.id) - p.cash + cash;
    const isMover = p.id === mover.id && !finished;
    const colour = playerColour(p);
    const fit = (text: string, maxW: number) => {
      let t = text.toUpperCase();
      while (t.length > 1 && measure(pixelSafe(t)).width > maxW) t = t.slice(0, -1);
      return t;
    };
    return (
      <div
        key={p.id}
        data-testid={`bk-player-${p.id}`}
        data-turn={isMover}
        className={`absolute ${p.bankrupt ? 'opacity-40 grayscale' : ''}`}
        style={{ left: A(left), top: A(top), width: A(CARD_W), height: A(32) }}
      >
        <img
          src={screenArt(`players/card-${colour}${isMover ? '-current' : ''}`)}
          alt=""
          className="absolute inset-0 block h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        {isMover && (
          <img
            src={screenArt('players/turn-marker')}
            alt=""
            className="absolute block"
            style={{
              left: A(Math.floor((CARD_W - 5) / 2)),
              top: A(-5),
              width: A(5),
              imageRendering: 'pixelated',
            }}
          />
        )}
        <div className="absolute" style={{ left: A(5), top: A(4), width: A(22), height: A(22) }}>
          <Avatar
            avatar={nickOf(p.id)?.avatar ?? 'fox'}
            size="fluid"
            className="h-full w-full !border !ring-0"
          />
        </div>
        <img
          src={screenArt(`players/frog-badge-${colour}`)}
          alt=""
          className="absolute block"
          style={{ left: A(19), top: A(17), width: A(8), imageRendering: 'pixelated' }}
        />
        <div className="absolute" style={{ left: A(31), top: A(4) }}>
          <PixelText
            s={s}
            parts={[{ text: fit(name(p.id) + (p.id === me ? '' : ''), 50), colour: '#ffffff' }]}
          />
        </div>
        <div className="absolute" style={{ left: A(31), top: A(12) }}>
          <PixelText
            s={s}
            parts={[{ text: money(cash), colour: cash < 0 ? '#ff8f73' : '#f7f1e4' }]}
          />
        </div>
        <div
          className="absolute"
          style={{ left: A(31), top: A(20) }}
          data-testid={`bk-networth-${p.id}`}
        >
          <PixelText s={s} parts={[{ text: money(worth), colour: '#74cca8' }]} />
        </div>
        {/* (tap the numbers for what they mean) */}
        <button
          type="button"
          className="absolute"
          style={{ left: A(31), top: A(11), width: A(50), height: A(16) }}
          data-testid={`bk-cash-${p.id}`}
          aria-label={`${name(p.id)}: ${money(cash)}, net worth ${money(worth)}`}
          onClick={() => setTip(tip === `cash-${p.id}` ? null : `cash-${p.id}`)}
        />
        {(p.jail > 0 || p.bankrupt) && (
          <div className="absolute" style={{ right: A(3), top: A(4) }}>
            <PixelText
              s={s}
              parts={[
                p.bankrupt
                  ? { text: 'OUT', colour: '#ff8f73' }
                  : { text: `JAIL ${p.jail}`, colour: '#f7f1e4' },
              ]}
            />
          </div>
        )}
        {tip === `cash-${p.id}` && (
          <span
            role="status"
            className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border-2 border-edge/40 bg-panel2 px-2 py-1.5 text-left text-xs font-normal normal-case text-ink shadow-lg"
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
  const extras = others.slice(3).reverse();
  // (me in the middle of the bottom row when there are two more)
  const bottomSeats =
    extras.length === 2 ? [extras[0]!, around[0]!, extras[1]!] : [around[0]!, ...extras];

  // Everything that pops up lives inside the middle of the board (never over a space).
  // A trade has just gone through: its cards swap places while the bonus is paid (the owners change after).
  const swapping = animating && !state.trade && state.events.some((e) => e.k === 'trade');
  const rainbowing = animating && state.events.some((e) => e.k === 'rainbow');
  const popupNode =
    finished && !animating ? (
      <EndBanner state={state} name={name} />
    ) : swapping ? (
      <TradeSwap state={state} name={name} />
    ) : rainbowing ? (
      <RainbowRoad state={state} name={name} />
    ) : card && card.phase !== 'wait' ? (
      <LuckCard
        kind={card.ev.kind}
        textLine={card.ev.text}
        who={card.ev.by}
        whoName={name(card.ev.by)}
        phase={card.phase === 'in' ? 'in' : 'out'}
      />
    ) : jailOn ? (
      <JailPanel state={state} busy={busy} send={send} cash={mePlayer?.cash ?? 0} />
    ) : owedBuy && settled && !fresh && !paying && !broke ? (
      <BuyOverlay state={state} me={me} tile={owedBuy} busy={busy} send={send} />
    ) : tileOpen ? (
      <TileSheet
        state={state}
        me={me}
        tileId={tileOpen}
        canAct={myTurn && !state.auction && !state.trade && state.phase !== 'buy'}
        send={send}
        name={name}
        onClose={() => setTileOpen(null)}
      />
    ) : auctionOn ? (
      <AuctionPanel
        state={state}
        me={me}
        name={name}
        send={send}
        busy={busy}
        deadline={game.deadline}
        serverTime={room.serverTime}
      />
    ) : tradeOn ? (
      <TradePanel
        state={state}
        me={me}
        name={name}
        send={send}
        busy={busy}
        deadline={game.deadline}
        serverTime={room.serverTime}
        pick={pick}
        onClearPick={() => setPick(null)}
      />
    ) : shortMsg ? (
      <p
        role="status"
        data-testid="bk-not-enough"
        className="label flex h-full w-full items-center justify-center bg-[#ff6b57]/90 p-[4%] text-center text-[3.2cqw] text-white"
      >
        {shortMsg}
      </p>
    ) : null;

  const canRoll = myTurn && state.phase === 'roll';
  const rollMessage = finished
    ? 'Game over'
    : note ||
      (room.spectating
        ? `${name(mover.id)} to play`
        : myTurn
          ? 'Your turn'
          : `${name(mover.id)} to play`);
  const fitText = (text: string, maxW: number) => {
    let t = text.toUpperCase();
    while (t.length > 1 && measure(pixelSafe(t)).width + 10 > maxW) t = t.slice(0, -1);
    return t.length < text.length ? t.slice(0, -2) + '..' : t;
  };
  const bp = (v: number) => `${(v / 257) * 100}%`;
  const top = rowXs(topSeats.length);
  const bottom = rowXs(bottomSeats.length);
  const barButton = (
    x: number,
    art: string,
    label: string,
    onClick?: () => void,
    testId?: string,
  ) =>
    onClick ? (
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        onClick={onClick}
        className="absolute block active:translate-y-px"
        style={{ left: A(x), top: A(18), width: A(18), height: A(20) }}
      >
        <img
          src={screenArt(`top-bar/${art}`)}
          alt=""
          className="block h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      </button>
    ) : null;
  const goalW = labelWidth(goalParts);
  const status = room.spectating
    ? 'Watching the game'
    : mePlayer?.bankrupt
      ? 'You are out of the game'
      : !canAct
        ? ''
        : !myTurn
          ? `Waiting for ${name(mover.id)}`
          : '';

  return (
    <div
      ref={root}
      className="h-full overflow-y-auto overflow-x-hidden"
      style={{
        backgroundColor: '#20325a',
        backgroundImage: `url(${screenArt('background/bg-pattern-18x18')})`,
        backgroundSize: `${A(18)}px ${A(18)}px`,
        imageRendering: 'pixelated',
      }}
      data-testid="bankrupt-game"
      data-phase={state.phase}
      data-seq={state.seq}
    >
      <div className="relative">
        {/* the dark strip at the top (the phone's status bar), the whole width */}
        <div
          className="absolute inset-x-0 top-0 bg-[#101628]"
          style={{ height: `calc(env(safe-area-inset-top) + ${A(14)}px)` }}
        />
        <div style={{ height: 'env(safe-area-inset-top)' }} />
        <div className="relative mx-auto" style={{ width: A(SCREEN_W), height: A(SCREEN_H) }}>
          {/* the top bar */}
          {barButton(6, 'button-back', 'Leave game', chrome?.onLeave, 'leave-game')}
          <img
            src={screenArt('top-bar/logo-bankrupt')}
            alt="Bankrupt"
            className="absolute block"
            style={{ left: A(30), top: A(18), width: A(68), imageRendering: 'pixelated' }}
          />
          {barButton(216, 'button-help', 'Rules', chrome?.onRules, 'rules-button')}
          {barButton(238, 'button-chat', 'Chat', chrome?.onChat, 'chat-open')}
          {barButton(260, 'button-settings', 'Settings', chrome?.onSettings, 'settings-button')}
          {!!chrome?.unread && (
            <span
              aria-hidden
              className="absolute block bg-[#ff6b57]"
              style={{ left: A(252), top: A(18), width: A(4), height: A(4) }}
            />
          )}

          {/* the goal and the round */}
          <div
            className="absolute"
            style={{ left: A(Math.floor(145 - goalW / 2)), top: A(42) }}
            data-testid="bk-goal"
          >
            <PixelText s={s} navy parts={goalParts} />
          </div>

          <div data-testid="bk-seats-top">
            {topSeats.map((i, k) => tag(players[i]!, top[k]!, 58))}
          </div>

          {/* the board's hard navy drop shadow, like every card and button has */}
          <div
            className="absolute bg-[#101628]"
            style={{ left: A(18), top: A(355), width: A(253), height: A(4) }}
          />
          <div className="absolute" style={{ left: A(16), top: A(98), width: A(257) }}>
            <Board
              state={ui}
              shown={shown}
              onTile={setTileOpen}
              pulse={pulse}
              picked={pick}
              overlay={popupNode}
              clear={tradeOn || auctionOn || swapping || rainbowing}
              onPulse={(id) => setPick(id === pick ? null : id)}
            >
              {/* one die, bigger, its colour shows the value; the message sits under it */}
              <div
                className="absolute"
                style={{ left: bp(114), top: bp(94), width: bp(29) }}
                data-testid="bk-dice"
              >
                {(state.dice ?? 0) > 0 || rolling ? (
                  <img
                    src={screenArt(`dice/die-${rolling ? face : state.dice}`)}
                    alt={rolling ? 'rolling' : `die ${state.dice}`}
                    data-testid="bk-die"
                    data-value={rolling ? 0 : state.dice}
                    className="block w-full"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </div>
              <div
                className="absolute flex w-full justify-center"
                style={{ top: bp(132) }}
                data-testid="bk-note"
                role="status"
              >
                <PixelText
                  s={s}
                  navy
                  parts={[{ text: fitText(rollMessage, 190), colour: '#f7f1e4' }]}
                />
              </div>
            </Board>
          </div>

          <div data-testid="bk-seats-bottom">
            {bottomSeats.map((i, k) => tag(players[i]!, bottom[k]!, 366))}
          </div>

          {/* the Roll button (pixel art), with the padlock for rolling automatically inside it */}
          <button
            type="button"
            data-testid="bk-roll"
            aria-label="Roll the dice"
            disabled={!canRoll || busy || rolling || animating}
            onClick={() => void send({ type: 'roll' })}
            className="absolute block active:translate-y-px disabled:active:translate-y-0"
            style={{ left: A(16), top: A(403), width: A(257), height: A(25) }}
          >
            <img
              src={screenArt(canRoll ? 'buttons/roll-the-dice' : 'buttons/roll-the-dice-disabled')}
              alt=""
              className="block h-full w-full"
              style={{ imageRendering: 'pixelated' }}
            />
          </button>
          {canAct && (
            <button
              type="button"
              data-testid="bk-roll-lock"
              aria-pressed={autoRoll}
              aria-label={autoRoll ? 'Stop rolling automatically' : 'Roll automatically'}
              onClick={() => setAutoRoll((v) => !v)}
              className={`absolute flex items-center justify-center border-2 ${
                autoRoll
                  ? 'border-[#101628] bg-[#101628] text-[#fdcf51]'
                  : 'border-[#101628] bg-[#fdcf51] text-[#101628]'
              }`}
              style={{ left: A(16 + 257 - 25), top: A(403 + 2), width: A(21), height: A(19) }}
            >
              <LockIcon open={!autoRoll} className="h-[70%] w-[70%]" />
            </button>
          )}
        </div>
      </div>

      {/* what is going on, under the screen */}
      <div className="flex flex-col items-center gap-1 px-3 pb-3 pt-2" data-testid="bk-actions">
        {status && (
          <span data-testid="bk-wait">
            <PixelText s={s} navy parts={[{ text: status, colour: '#f7f1e4' }]} />
          </span>
        )}
        {mePlayer && mePlayer.cash < 0 && !mePlayer.bankrupt && (
          <span data-testid="bk-warning">
            <PixelText
              s={s}
              navy
              parts={[
                {
                  text: `In debt: below ${money(state.board.bankruptBelow)} you are bankrupt`,
                  colour: '#ff8f73',
                },
              ]}
            />
          </span>
        )}
      </div>
    </div>
  );
}

/** You are in jail: pay the fee or sit it out (only asked when the fee can be paid). */
function JailPanel({
  state,
  busy,
  send,
  cash,
}: {
  state: State;
  busy: boolean;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  cash: number;
}) {
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-center gap-[3cqw] bg-[#101628] p-[4cqw] text-white"
      data-testid="bk-jail-ask"
      role="dialog"
      aria-label="Jail"
    >
      <p className="label text-[5cqw] font-black uppercase leading-none text-neon">In jail!</p>
      <p className="label text-center text-[2.6cqw] leading-tight">
        Pay {money(state.board.jailFee)} to get out now, or stay {state.board.jailTurns} turns.
      </p>
      <div className="grid w-full grid-cols-2 gap-[2cqw]">
        <Button
          variant="gold"
          data-testid="bk-pay-jail"
          disabled={busy || cash < state.board.jailFee}
          onClick={() => void send({ type: 'payJail' })}
        >
          Pay {money(state.board.jailFee)}
        </Button>
        <Button
          variant="secondary"
          data-testid="bk-wait-jail"
          disabled={busy}
          onClick={() => void send({ type: 'wait' })}
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
