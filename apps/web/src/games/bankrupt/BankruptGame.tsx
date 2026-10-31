import { useEffect, useMemo, useRef, useState } from 'react';
import { bankrupt } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { Board, money } from './Board';
import { BuyOverlay } from './BuyOverlay';
import { TileSheet } from './TileSheet';
import { useCashFx } from './useCashFx';
import { useCountdown } from '../../lib/useCountdown';
import { art, dieUrl, tokenOf } from './art';

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
          ? `${name(e.winner)} won ${tile(e.tile)} for ${money(e.amount)}${e.bonus > 0 ? ` · +${money(e.bonus)} each` : ''}`
          : `${tile(e.tile)} was not sold`,
      );
    else if (e.k === 'bankrupt') parts.push(`${name(e.by)} is bankrupt!`);
  }
  return parts.join(' · ');
}

/**
 * Where each token is drawn: it walks to its new space one step at a time (after the dice have rolled),
 * and jumps straight there when it was sent to jail.
 */
function useWalking(state: State) {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.pos])),
  );
  const seenSeq = useRef(state.seq);
  const [rolling, setRolling] = useState(false);
  const rollTimer = useRef<ReturnType<typeof setTimeout>>();
  const n = state.board.tiles.length;
  // A new move: the dice tumble first, then the tokens walk.
  useEffect(() => {
    if (seenSeq.current === state.seq) return;
    seenSeq.current = state.seq;
    const rolled = state.events.some((e) => e.k === 'roll');
    const jailed = new Set(state.events.flatMap((e) => (e.k === 'jail' ? [e.by] : [])));
    if (jailed.size > 0)
      setShown((cur) => ({
        ...cur,
        ...Object.fromEntries(
          [...jailed].map((id) => [id, state.players.find((p) => p.id === id)!.pos]),
        ),
      }));
    if (!rolled) return;
    setRolling(true);
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRolling(false), bankrupt.ROLL_MS);
  }, [state]);
  // (The timer must outlive the next state push, so it is only cleared when the screen goes away.)
  useEffect(() => () => clearTimeout(rollTimer.current), []);
  useEffect(() => {
    if (rolling) return;
    const behind = state.players.filter((p) => (shown[p.id] ?? p.pos) !== p.pos);
    if (behind.length === 0) return;
    const t = setTimeout(
      () =>
        setShown((cur) => {
          const next = { ...cur };
          for (const p of behind) {
            const at = cur[p.id] ?? p.pos;
            const steps = (p.pos - at + n) % n;
            next[p.id] = steps > n / 2 ? p.pos : (at + 1) % n;
            if (next[p.id] === 0 || steps === 1) play('tap');
          }
          return next;
        }),
      bankrupt.STEP_MS,
    );
    return () => clearTimeout(t);
  }, [state, shown, rolling, n]);
  const settled = !rolling && state.players.every((p) => (shown[p.id] ?? p.pos) === p.pos);
  return { shown, rolling, settled };
}

export function BankruptGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const state = game.view as State;
  const players = state.players;
  const mePlayer = players.find((p) => p.id === me);
  const mover = players[state.turn]!;
  const nickOf = (id: string) => room.members.find((m) => m.id === id);
  const name = (id: string) => nickOf(id)?.nickname ?? 'Player';
  const { shown, rolling, settled } = useWalking(state);
  const cashShown = useCashFx(state, settled);
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

  const note = useMemo(() => describe(state, name), [state, room.members]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = state.board.tiles[mover.pos]!;
  const owedBuy = state.phase === 'buy' && myTurn && bankrupt.isOwnable(here) ? here : null;
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
        className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1 ${
          isMover ? 'bg-neon/25 ring-2 ring-neon' : ''
        } ${p.bankrupt ? 'opacity-40 grayscale' : ''}`}
      >
        <div className="flex items-center gap-1">
          <img
            src={art(`token-${tokenOf(seat)}`)}
            alt=""
            className="h-5 w-5"
            style={{ imageRendering: 'pixelated' }}
          />
          <Avatar avatar={nickOf(p.id)?.avatar ?? 'fox'} size="sm" />
        </div>
        <span className="max-w-full truncate text-xs font-bold text-onbg">
          <PlayerName name={name(p.id)} id={p.id} me={me} />
          {p.id === me && ' (you)'}
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
  const half = Math.ceil(players.length / 2);

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
      <div className="flex gap-1">{players.slice(0, half).map((p, i) => tag(p, i))}</div>

      <Board state={state} shown={shown} onTile={setTileOpen}>
        <img
          src={art('landmark')}
          alt=""
          className="h-[32%] w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="flex h-[17cqw] items-center" data-testid="bk-dice">
          {(state.dice ?? 0) > 0 || rolling ? (
            <img
              src={dieUrl(rolling ? face : state.dice!)}
              alt={rolling ? 'rolling' : `die ${state.dice}`}
              data-testid="bk-die"
              data-value={rolling ? 0 : state.dice}
              className={`h-[17cqw] w-[17cqw] ${rolling ? 'bk-tumble' : ''}`}
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
        </div>
        <p
          className="line-clamp-3 max-w-full px-1 text-center text-[2.2cqw] font-bold leading-tight text-[#2b3b57]"
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

      <div className="flex gap-1">{players.slice(half).map((p, i) => tag(p, half + i))}</div>

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
            {settled ? 'Buy it or cancel…' : 'Walking…'}
          </p>
        ) : mePlayer!.jail > 0 && state.phase === 'roll' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="gold"
              data-testid="bk-pay-jail"
              disabled={busy || mePlayer!.cash < state.board.jailFee}
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
              Wait ({mePlayer!.jail})
            </Button>
          </div>
        ) : state.phase === 'roll' ? (
          <Button
            variant="gold"
            data-testid="bk-roll"
            disabled={busy || rolling}
            onClick={() => void send({ type: 'roll' })}
          >
            Roll the dice
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="label text-center text-[10px] text-onbg/80">
              You are on the Auction corner: tap one of your spaces to auction it, or skip.
            </p>
            <Button
              variant="secondary"
              data-testid="bk-end"
              disabled={busy || rolling}
              onClick={() => void send({ type: 'endTurn' })}
            >
              Skip
            </Button>
          </div>
        )}
        {mePlayer && mePlayer.cash < 0 && !mePlayer.bankrupt && (
          <p className="label text-center text-[10px] text-[#ff8f73]" data-testid="bk-warning">
            You are in debt. Below {money(state.board.bankruptBelow)} you are bankrupt: tap a space
            to sell.
          </p>
        )}
      </div>

      {owedBuy && settled && (
        <BuyOverlay state={state} me={me} tile={owedBuy} busy={busy} send={send} />
      )}
      <TileSheet
        state={state}
        me={me}
        tileId={tileOpen}
        canAct={myTurn && !state.auction && state.phase !== 'buy'}
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
  const base = a.high?.amount ?? 0;
  const isSeller = a.seller === me;
  const leading = a.high?.player === me;
  const passed = a.passed.includes(me);
  const left = useCountdown(deadline, serverTime);
  // Out of the bidding (stepped out, or not enough money to top the highest bid): the prices are greyed out.
  const out = passed || (!leading && cash <= Math.max(bankrupt.MIN_BID - 1, base));
  return (
    <div className="flex flex-col gap-2" data-testid="bk-auction">
      <p className="label text-center">
        Auction: <b className="text-neon">{tile?.name}</b>
        {a.seller ? ` (${name(a.seller)} sells)` : ''}
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
        {a.high ? `Highest bid ${money(a.high.amount)} by ${name(a.high.player)}` : 'No bids yet'}
      </p>
      {isSeller ? (
        <Button
          variant="secondary"
          data-testid="bk-cancel-auction"
          disabled={busy}
          onClick={() => void send({ type: 'cancelAuction' })}
        >
          Cancel auction
        </Button>
      ) : (
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
      )}
    </div>
  );
}
