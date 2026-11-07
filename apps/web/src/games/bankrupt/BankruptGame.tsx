import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { AUCTION_WON_MS, AuctionWon } from './AuctionWon';
import { TipBubble } from '../../components/TipBubble';
import { toggleTip, useActiveTip } from '../../lib/tip';
import { BailPanel } from './BailPanel';
import { Plaza, SPECIAL_SLICES, WHEEL_SLICES, sliceFor } from './Plaza';
import type { Spin } from './Plaza';
import { TRADE_CANCELLED_MS, TradeCancelled } from './TradeCancelled';
import { RainbowRoad } from './RainbowRoad';
import { TradePanel, TradeSwap, pulsingTiles } from './TradePanel';
import { TileSheet } from './TileSheet';
import { useCashFx } from './useCashFx';
import { PixelPanel, PixelText, labelWidth } from './PixelLabel';
import type { Part } from './PixelLabel';
import { measure, pixelSafe } from './pixel-text/pixelText';
import { CARD_H, CARD_W, SCREEN_W, rowXs, screenArt } from './screenArt';
import { useStageScale } from './useStage';
import { POLICE } from './police';
import type { PoliceView } from './police';
import { gridPos } from './grid';

type State = bankrupt.BankruptState;

/** A roll in words (the special wheel can also give $50 or jail). */
function rollText(e: Extract<bankrupt.BankruptEvent, { k: 'roll' }>): string {
  if (!e.wheel) return `rolled ${e.dice}`;
  if (e.dice > 0) return `spun the special wheel: ${e.dice}`;
  return e.wheel.slice === 'JAIL'
    ? 'spun JAIL on the special wheel'
    : 'won $50 on the special wheel';
}

/** What the last move did, in words (the line in the middle of the board). */
function describe(s: State, name: (id: string) => string): string {
  const tile = (id: string) => s.board.tiles.find((t) => t.id === id)?.name ?? id;
  const parts: string[] = [];
  for (const e of s.events) {
    if (e.k === 'roll') parts.push(`${name(e.by)} ${rollText(e)}`);
    else if (e.k === 'salary') parts.push(`${name(e.by)} passed Start: +${money(e.amount)}`);
    else if (e.k === 'rent') parts.push(`${name(e.by)} paid ${name(e.to)} ${money(e.amount)} rent`);
    else if (e.k === 'buy') parts.push(`${name(e.by)} bought ${tile(e.tile)}`);
    else if (e.k === 'card') parts.push(e.text);
    else if (e.k === 'jail') parts.push(`${name(e.by)} went to jail`);
    else if (e.k === 'free') parts.push(`${name(e.by)} is out of jail`);
    else if (e.k === 'jailSkip') parts.push(`${name(e.by)} sits out in jail (${e.left} to go)`);
    else if (e.k === 'bail')
      parts.push(`Free ${name(e.subject)}! Everybody paid ${money(e.amount)} bail`);
    else if (e.k === 'bailRefused')
      parts.push(`${name(e.by)} would not pay ${name(e.subject)}'s bail`);
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
    else if (e.k === 'tradeNone') parts.push(`${name(e.by)} has nobody to trade with`);
    else if (e.k === 'bankrupt') parts.push(`${name(e.by)} is bankrupt!`);
  }
  return parts.join(' · ');
}

/**
 * What a move did, split for the log: who made it and what happened, without repeating that name (a name only
 * appears where somebody else is meant). Several moves of one turn are joined under the one name.
 */
function turnParts(
  s: State,
  name: (id: string) => string,
): { actor: string; who: string; parts: string[] } | null {
  const tile = (id: string) => s.board.tiles.find((t) => t.id === id)?.name ?? id;
  const first = s.events.find((e) => 'by' in e || 'winner' in e);
  const actor = first
    ? 'by' in first
      ? first.by
      : (first as { winner: string | null }).winner
    : null;
  if (!actor) return null;
  const nm = (id: string) => (id === actor ? '' : `${name(id)} `);
  const parts: string[] = [];
  for (const e of s.events) {
    if (e.k === 'roll') parts.push(`${nm(e.by)}${rollText(e)}`);
    else if (e.k === 'salary') parts.push(`${nm(e.by)}passed Start: +${money(e.amount)}`);
    else if (e.k === 'rent') parts.push(`${nm(e.by)}paid ${name(e.to)} ${money(e.amount)} rent`);
    else if (e.k === 'buy') parts.push(`${nm(e.by)}bought ${tile(e.tile)}`);
    else if (e.k === 'card') parts.push(e.text);
    else if (e.k === 'jail') parts.push(`${nm(e.by)}went to jail`);
    else if (e.k === 'free') parts.push(`${nm(e.by)}is out of jail`);
    else if (e.k === 'jailSkip') parts.push(`${nm(e.by)}sits out in jail (${e.left} to go)`);
    else if (e.k === 'bail')
      parts.push(`Free ${name(e.subject)}! Everybody paid ${money(e.amount)} bail`);
    else if (e.k === 'bailRefused')
      parts.push(`${name(e.by)} would not pay ${name(e.subject)}'s bail`);
    else if (e.k === 'build') parts.push(`${nm(e.by)}built on ${tile(e.tile)}`);
    else if (e.k === 'sold') parts.push(`${nm(e.by)}sold ${tile(e.tile)}`);
    else if (e.k === 'auction')
      parts.push(
        e.winner
          ? `${nm(e.winner)}won ${tile(e.tile)} for ${money(e.amount)}`
          : `${tile(e.tile)} was not sold`,
      );
    else if (e.k === 'trade')
      parts.push(
        `traded ${tile(e.give)} with ${name(e.with)} for ${tile(e.take)}: +${money(e.bonus)} each`,
      );
    else if (e.k === 'tradeEnd') parts.push('did not trade');
    else if (e.k === 'tradeNone') parts.push('has nobody to trade with');
    else if (e.k === 'bankrupt') parts.push(`${nm(e.by)}is bankrupt!`);
  }
  return parts.length ? { actor, who: name(actor), parts: parts.map((x) => x.trim()) } : null;
}

type LogLine = { actor: string; who: string; parts: string[] };
/** Add what a move did to the log: under the same name when the same player goes on (a part already there, e.g. a
 * luck card written when it slid in, is not written twice); the last three turns are kept. */
function addToLog(l: LogLine[], t: LogLine): LogLine[] {
  if (l[0]?.actor === t.actor) {
    // (a long part that is in both is the same luck card: it stays once, in the order of the full list)
    const keep = l[0].parts.filter((p) => !(p.length > 14 && t.parts.includes(p)));
    return [{ ...l[0], parts: [...keep, ...t.parts] }, ...l.slice(1)];
  }
  return [t, ...l].slice(0, 3);
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
  // The police car fetches a frog that a card sent to jail from the top row (instead of letting it hop there).
  const [police, setPolice] = useState<PoliceView | null>(null);
  const plan = useRef<{
    id: string;
    from: number;
    colour: string;
    jailIdx: number;
    trigger: 'roll' | 'card';
  } | null>(null);
  const target = (p: State['players'][number]) => hold?.[p.id] ?? p.pos;

  // A new move: the die tumbles first, then the tokens walk.
  useEffect(() => {
    if (seenSeq.current === state.seq) return;
    seenSeq.current = state.seq;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    plan.current = null;
    setPolice(null);
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
      const jailEv = state.events.find((e) => e.k === 'jail');
      const jailed =
        jailEv && jailEv.k === 'jail' ? state.players.find((p) => p.id === jailEv.by) : undefined;
      // (the car only drives along the top row: from the "?" corner or a space next to it)
      plan.current =
        !reduced() && jailed && jailed.id === ev.by && stop !== undefined && stop >= 7 && stop <= 13
          ? {
              id: jailed.id,
              from: stop,
              colour: bankrupt.PLAYER_COLOURS[jailed.colour % bankrupt.PLAYER_COLOURS.length]!,
              jailIdx: state.board.tiles.findIndex((t) => t.kind === 'jail'),
              trigger: 'card',
            }
          : null;
    } else {
      setCard(null);
      // A roll that lands on the Jail space: the frog does not hop there, the police car comes to fetch it from
      // where it stands (one die: it always starts on the top row).
      const jailIdx = state.board.tiles.findIndex((t) => t.kind === 'jail');
      const jailEv = state.events.find((e) => e.k === 'jail');
      const jailer =
        jailEv && jailEv.k === 'jail' ? state.players.find((p) => p.id === jailEv.by) : undefined;
      const wheelJail = state.events.find((e) => e.k === 'roll' && e.wheel?.slice === 'JAIL');
      const mv = (
        wheelJail && wheelJail.k === 'roll' && wheelJail.wheel
          ? { from: wheelJail.wheel.from, to: jailIdx }
          : state.events.filter((e) => e.k === 'move' && jailer && e.by === jailer.id).at(-1)
      ) as { from: number; to: number } | undefined;
      if (
        !reduced() &&
        rolled &&
        jailer &&
        mv &&
        mv.to === jailIdx &&
        mv.from >= 7 &&
        mv.from < jailIdx
      ) {
        plan.current = {
          id: jailer.id,
          from: mv.from,
          colour: bankrupt.PLAYER_COLOURS[jailer.colour % bankrupt.PLAYER_COLOURS.length]!,
          jailIdx,
          trigger: 'roll',
        };
        setHold({ [jailer.id]: mv.from });
      } else setHold(null);
    }
    if (!rolled) return;
    setRolling(true);
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => {
      setRolling(false);
      // the die has settled: the police car sets off
      if (plan.current?.trigger === 'roll') runPolice(plan.current);
    }, bankrupt.ROLL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          setCard(null);
          if (plan.current?.trigger === 'card') runPolice(plan.current);
          else setHold(null);
        },
        slide + show + slide,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, walked]);
  // The sequence, fast: the car comes out of the Jail space, drives to the frog, turns round, takes it, drives back,
  // delivers it behind the bars and leaves. (Times in ms from the start.)
  const runPolice = (job: { id: string; from: number; colour: string; jailIdx: number }) => {
    const n2 = state.board.tiles.length;
    const xOf = (i: number) => gridPos(i, n2).col * 32 + 16;
    const jx = xOf(job.jailIdx);
    const fx = xOf(job.from) + POLICE.parkOffset;
    const drive = Math.max(POLICE.minDriveMs, Math.abs(jx - fx) * POLICE.msPerPx);
    const base = {
      id: job.id,
      colour: job.colour,
      siren: 'a' as const,
      carrying: false,
      hideFrog: false,
      delivered: false,
      bump: false,
    };
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const set = (patch: Partial<PoliceView>) => setPolice((v) => (v ? { ...v, ...patch } : v));
    setPolice({ ...base, x: jx, ms: 0, dir: 'left' });
    play('siren');
    let t = 40;
    at(t, () => set({ x: fx, ms: drive }));
    t += drive;
    at(t, () => set({ dir: 'up', ms: 0 }));
    at((t += POLICE.uturnFrameMs), () => set({ dir: 'right' }));
    at((t += POLICE.uturnFrameMs), () => set({ carrying: true, hideFrog: true, bump: true }));
    at((t += POLICE.bumpMs), () => set({ bump: false, x: jx, ms: drive }));
    t += drive + POLICE.pauseMs;
    at(t, () => {
      // delivered: the frog is behind the bars (its token waits in the cage until the car has left)
      setShown((cur) => ({ ...cur, [job.id]: job.jailIdx }));
      setHold(null);
      set({ delivered: true, carrying: false });
    });
    at((t += POLICE.pauseMs), () => set({ x: 257 + 30, ms: POLICE.leaveMs }));
    at((t += POLICE.leaveMs), () => setPolice(null));
  };
  // The siren lights flash.
  const sirenOn = police !== null;
  useEffect(() => {
    if (!sirenOn) return;
    const i = setInterval(
      () => setPolice((v) => (v ? { ...v, siren: v.siren === 'a' ? 'b' : 'a' } : v)),
      POLICE.sirenMs,
    );
    return () => clearInterval(i);
  }, [sirenOn]);
  const cardBusy = card !== null;
  return { shown, rolling, settled: walked && !cardBusy && !police, card, cardBusy, police };
}

/** Moves that make their own sound (the cash sound when the money moves). */
const NO_TAP = new Set<bankrupt.BankruptMove['type']>([
  'buy',
  'build',
  'sellProperty',
  'sellBuilding',
  'payJail',
  'rainbow',
  'tradeAccept',
]);

export function BankruptGame({ room, me, sendMove }: GameUiProps) {
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
  const { shown, rolling, settled, card, cardBusy, police } = useWalking(state);
  // The trade on the Auction corner is off (cancelled, nobody dealt, nobody to trade with): a short "no deal" show.
  const [noDealDone, setNoDealDone] = useState(state.seq);
  const noDealOn =
    noDealDone !== state.seq && state.events.some((e) => e.k === 'tradeEnd' || e.k === 'tradeNone');
  // An auction has been won: the gavel show runs first (the payment and the new owner come after it).
  const [wonDone, setWonDone] = useState(state.seq);
  const winOn = wonDone !== state.seq && state.events.some((e) => e.k === 'auction' && !!e.winner);
  const { shown: cashShown, playing: paying } = useCashFx(state, settled && !winOn);
  void cardBusy;
  // Nobody acts while the last player's token is still walking, the die tumbles or a payment is on show.
  // (`fresh`: a new move has just arrived and the hooks above have not started its animations yet: there is
  // no instant in between where the buttons work.)
  const [doneSeq, setDoneSeq] = useState(state.seq);
  useEffect(() => setDoneSeq(state.seq), [state.seq]);
  const fresh = doneSeq !== state.seq;
  const animating = fresh || !settled || paying || winOn || noDealOn || queue.length > 0;
  useEffect(() => {
    if (!winOn || fresh || !settled) return;
    const t = setTimeout(() => setWonDone(state.seq), reduced() ? 1200 : AUCTION_WON_MS);
    return () => clearTimeout(t);
  }, [winOn, fresh, settled, state.seq]);
  useEffect(() => {
    if (!noDealOn || fresh || !settled || paying) return;
    const t = setTimeout(() => setNoDealDone(state.seq), reduced() ? 900 : TRADE_CANCELLED_MS);
    return () => clearTimeout(t);
  }, [noDealOn, fresh, settled, paying, state.seq]);
  useEffect(() => {
    if (queue.length === 0 || fresh || !settled || paying || winOn || noDealOn) return;
    setState(queue[0]!);
    setQueue((q) => q.slice(1));
  }, [queue, fresh, settled, paying, winOn, noDealOn]);
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
  // (a move waiting in the queue does not hold the board back: once this move has been played out it shows,
  // e.g. a computer's purchase, even when its next move is already on the way)
  const playing = fresh || !settled || paying || winOn || noDealOn;
  useEffect(() => {
    if (!playing) setSeen(state);
  }, [playing, state]);
  const ui = playing ? seen : state;
  const [tileOpen, setTileOpen] = useState<string | null>(null);
  const openTip = useActiveTip();
  const [busy, setBusy] = useState(false);
  const finished = state.phase === 'over';
  // (the trade starts only when everything before it has been played out: walk, card, payments)
  const tradeOn = !!state.trade && !animating;
  const auctionOn = !!state.auction && !animating;
  const bailOn = !!state.bail && !animating;
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
    // The click sound for everything that has no sound of its own (money moves make the cash sound).
    if (!NO_TAP.has(move.type)) play('tap');
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
    if ((mePlayer?.cash ?? 0) < 0) return; // (in debt: the lock switches itself off, see below)
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
  useEffect(() => {
    // (no pop-up for it: the price on the board is crossed out; the space is just passed for me)
    if (!broke || !settled || fresh || !owedBuy) return;
    const pass = setTimeout(() => void sendMove({ type: 'decline' }), 800);
    return () => clearTimeout(pass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broke, settled, fresh, owedBuy?.id]);
  // Auto roll switches itself off when I am in debt (below $0), with a warning: from here on I decide.
  const [debtWarn, setDebtWarn] = useState(false);
  const inDebt = !!mePlayer && !mePlayer.bankrupt && mePlayer.cash < 0;
  useEffect(() => {
    if (!autoRoll || !inDebt || animating) return;
    setAutoRoll(false);
    setDebtWarn(true);
    play('turn');
    const t = setTimeout(() => setDebtWarn(false), 3200);
    return () => clearTimeout(t);
  }, [autoRoll, inDebt, animating]);
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
  const { s, h: hArt, w } = useStageScale(root);
  const A = (n: number) => n * s;
  // (the shared top bar paints the same dot pattern at the same size: it reads this)
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--bk-art', `${s}px`);
  }, [s]);
  // The whole page (also outside the column, behind the top bar and under the board) is the dot pattern: no felt
  // gradient, glows or contour lines while this screen is open (`html.bk-page` in index.css).
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('bk-page');
    html.style.setProperty('--bk-pattern', `url("${screenArt('background/bg-pattern-18x18')}")`);
    return () => {
      html.classList.remove('bk-page');
      html.style.removeProperty('--bk-pattern');
      html.style.removeProperty('--bk-art');
    };
  }, []);
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
    const sizeOf = (text: string) => (measure(pixelSafe(text)).width * 2 <= 50 ? 2 : 1);
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
        style={{ left: A(left), top: A(top), width: A(CARD_W), height: A(CARD_H) }}
      >
        <img
          src={screenArt(`players/card-big-${colour}${isMover ? '-current' : ''}`)}
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
        <div className="absolute" style={{ left: A(5), top: A(6), width: A(32), height: A(32) }}>
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
          style={{ left: A(28), top: A(29), width: A(8), imageRendering: 'pixelated' }}
        />
        <div className="absolute" style={{ left: A(41), top: A(6) }}>
          <PixelText s={s} parts={[{ text: fit(name(p.id), 50), colour: '#ffffff' }]} />
        </div>
        {/* the numbers twice as big when they fit */}
        <div className="absolute" style={{ left: A(41), top: A(16) }}>
          <PixelText
            s={s}
            k={sizeOf(money(cash))}
            parts={[{ text: money(cash), colour: cash < 0 ? '#ff8f73' : '#f7f1e4' }]}
          />
        </div>
        <div
          className="absolute"
          style={{ left: A(41), top: A(30) }}
          data-testid={`bk-networth-${p.id}`}
        >
          <PixelText
            s={s}
            k={sizeOf(money(worth))}
            parts={[{ text: money(worth), colour: '#74cca8' }]}
          />
        </div>
        {/* (tap the numbers for what they mean) */}
        <button
          type="button"
          className="absolute"
          style={{ left: A(41), top: A(15), width: A(50), height: A(30) }}
          data-testid={`bk-cash-${p.id}`}
          aria-label={`${name(p.id)}: ${money(cash)}, net worth ${money(worth)}`}
          data-tip-trigger
          onClick={() => toggleTip(`bk-cash:${p.id}`)}
        />
        {(p.jail > 0 || p.bankrupt) && (
          <div className="absolute" style={{ right: A(3), top: A(6) }}>
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
        <TipBubble
          show={openTip === `bk-cash:${p.id}`}
          className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border-2 border-edge/40 bg-panel2 px-2 py-1.5 text-left text-xs font-normal normal-case text-ink shadow-lg"
        >
          {p.cash < 0 ? (
            <>
              <b className="text-[#ff8f73]">Careful:</b> below {money(state.board.bankruptBelow)}{' '}
              you are bankrupt.{' '}
            </>
          ) : null}
          <span className="text-[#7ee08c]">Green = net worth</span>: cash plus what your spaces and
          buildings sell for.
        </TipBubble>
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

  const winShow = winOn && settled && !fresh;
  const noDealShow = noDealOn && settled && !fresh && !paying;
  // Where the won card flies to: towards the winner's seat (top row, me at the bottom, extra seats beside me).
  const wonEv = state.events.find((e) => e.k === 'auction' && e.winner);
  const wonAt =
    wonEv && wonEv.k === 'auction'
      ? around.indexOf(players.findIndex((p) => p.id === wonEv.winner))
      : 0;
  const wonTo =
    wonAt <= 0
      ? { dx: -40, dy: 70 }
      : wonAt <= topSeats.length
        ? { dx: (wonAt - 1 - (topSeats.length - 1) / 2) * 45, dy: -75 }
        : { dx: -10 - (wonAt - topSeats.length) * 15, dy: 70 };

  // Everything that pops up lives inside the middle of the board (never over a space).
  // A trade has just gone through: its cards swap places while the bonus is paid (the owners change after).
  const swapping = animating && !state.trade && state.events.some((e) => e.k === 'trade');
  const rainbowing = animating && state.events.some((e) => e.k === 'rainbow');
  const popupNode =
    finished && !animating ? (
      <EndBanner state={state} name={name} />
    ) : swapping ? (
      <TradeSwap state={state} name={name} />
    ) : noDealShow ? (
      <TradeCancelled state={state} name={name} />
    ) : winShow ? (
      <AuctionWon state={state} name={name} to={wonTo} />
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
        canBuild={
          myTurn && state.phase === 'roll' && !animating && !busy && !state.auction && !state.trade
        }
        send={send}
        name={name}
        onClose={() => setTileOpen(null)}
      />
    ) : bailOn ? (
      <BailPanel
        state={state}
        me={me}
        name={name}
        send={send}
        busy={busy}
        deadline={game.deadline}
        serverTime={room.serverTime}
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
    ) : debtWarn ? (
      <p
        role="alert"
        data-testid="bk-debt-warning"
        className="label flex h-full w-full items-center justify-center bg-[#ff6b57]/90 p-[4%] text-center text-[3.2cqw] leading-snug text-white"
      >
        You are below $0. Auto roll is off.
      </p>
    ) : null;

  // The log under the die: the last three turns, each under one name (the moves of one turn are joined), written
  // once a move has been played out.
  const [log, setLog] = useState<{ actor: string; who: string; parts: string[] }[]>([]);
  const loggedSeq = useRef(-1);
  useEffect(() => {
    if (animating || loggedSeq.current === state.seq) return;
    loggedSeq.current = state.seq;
    const t = turnParts(state, name);
    if (!t) return;
    setLog((l) => addToLog(l, t));
  }, [animating, state.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  // The luck card is written to the log the moment it slides in (not only when the whole move has been played out).
  const shownCard = card && card.phase !== 'wait' ? card.ev : null;
  useEffect(() => {
    if (!shownCard) return;
    setLog((l) =>
      addToLog(l, { actor: shownCard.by, who: name(shownCard.by), parts: [shownCard.text.trim()] }),
    );
  }, [shownCard]); // eslint-disable-line react-hooks/exhaustive-deps
  // A sentence in lines that fit `maxW` art pixels (breaks at spaces).
  const wrap = (text: string, maxW: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.toUpperCase().split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(pixelSafe(next)).width > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  // The spaces I can build on right now (a whole colour, not fully built, enough cash, before I roll).
  const upgradable = new Set<string>(
    myTurn && state.phase === 'roll' && !animating && !state.auction && !state.trade
      ? state.board.tiles
          .filter(
            (t): t is bankrupt.PropertyTile =>
              t.kind === 'property' &&
              ui.owned[t.id]?.owner === me &&
              (ui.owned[t.id]?.level ?? 0) < 3 &&
              bankrupt.ownsSet(ui, me, t) &&
              (mePlayer?.cash ?? 0) >= t.buildCost,
          )
          .map((t) => t.id)
      : [],
  );
  // The free spaces I cannot pay for: their price on the board is crossed out.
  const myCash = cashShown[me] ?? mePlayer?.cash ?? 0;
  const cantAfford = new Set<string>(
    !room.spectating && mePlayer && !mePlayer.bankrupt && !finished
      ? ui.board.tiles
          .filter((t) => bankrupt.isOwnable(t) && !ui.owned[t.id] && t.price > myCash)
          .map((t) => t.id)
      : [],
  );
  const canRoll = myTurn && state.phase === 'roll';
  // (looks and works the same: yellow only while a tap really rolls)
  const rollReady = canRoll && !busy && !rolling && !animating;
  // The wheel: it spins onto what the last roll was (the special wheel's slice comes from the game), and while it
  // stands still it shows the set the NEXT roll uses (the special one after three sixes or a fortunate-wheel card).
  const rollEv = state.events.find((e) => e.k === 'roll');
  const spin = useMemo<Spin | null>(() => {
    if (!rollEv || rollEv.k !== 'roll') return null;
    const slices = rollEv.wheel ? SPECIAL_SLICES : WHEEL_SLICES;
    return {
      key: state.seq,
      slices,
      idx: rollEv.wheel ? rollEv.wheel.idx : sliceFor(slices, rollEv.dice),
      ms: bankrupt.ROLL_MS - 400,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seq]);
  // The space the frog will land on blinks white on the very beat of the wheel's winning slice, before it hops.
  const [landBlink, setLandBlink] = useState(false);
  const landTile = (() => {
    if (!rollEv || rollEv.k !== 'roll') return null;
    if (rollEv.wheel?.slice === 'JAIL')
      return state.board.tiles.find((t) => t.kind === 'jail')?.id ?? null;
    const mv = state.events.find((e) => e.k === 'move' && e.by === rollEv.by);
    return mv && mv.k === 'move' ? (state.board.tiles[mv.to]?.id ?? null) : null;
  })();
  const idleSlices =
    state.options.specialWheel &&
    !finished &&
    (mover.wheel || state.sixes === bankrupt.SIXES_FOR_WHEEL)
      ? SPECIAL_SLICES
      : WHEEL_SLICES;
  const rollMessage = finished
    ? 'Game over'
    : note ||
      (room.spectating
        ? `${name(mover.id)} to play`
        : myTurn
          ? 'Your turn'
          : `${name(mover.id)} to play`);
  const bp = (v: number) => `${(v / 257) * 100}%`;
  const top = rowXs(topSeats.length);
  const extraXs = rowXs(extras.length);
  // The board keeps its proportions and is as wide as the screen allows (1 % less for rounded corners, its
  // drop shadow included), whatever the phone: it is not on the whole-pixel grid. The screen stretches to the
  // phone's height: the board sits in the middle of it, my card and the Roll button share one row in the bottom
  // fifth, and the extra opponents (5 or 6 players) stand above that row.
  const totalPx = Math.floor(w * 0.99);
  const boardPx = Math.floor(totalPx / (1 + 4 / 257));
  const bs = boardPx / 257; // css px per board art pixel
  const boardArt = boardPx / s; // the board's size in screen art pixels
  // The layout's own positions, from the top of the screen (just under the top bar): the goal label at 33, the
  // opponents' cards at 54 (19 px over the board), the board at 119, and my card + Roll button 24 px under the
  // board (66 with the extra seats). Nothing is stretched or centred: what is left over below is just the pattern.
  const boardTop = 107; // art px (12 higher than the editor's 119: 50 px of the screenshot at 3x)
  const gapBelow = extras.length ? 66 : 24;
  const rowY = Math.round(boardTop + boardArt + gapBelow);
  const H = Math.max(rowY + CARD_H + 70, hArt);
  const cardsY = 42; // the opponents' row (cards are 46 high + 2 shadow)
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
        backgroundImage: `url("${screenArt('background/bg-pattern-18x18')}")`,
        backgroundSize: `${A(18)}px ${A(18)}px`,
        backgroundAttachment: 'fixed',
        imageRendering: 'pixelated',
      }}
      data-testid="bankrupt-game"
      data-phase={state.phase}
      data-seq={state.seq}
    >
      <div className="relative">
        <div className="relative mx-auto" style={{ width: A(SCREEN_W), height: A(H) }}>
          {/* the goal and the round */}
          <div
            className="absolute"
            style={{ left: A(Math.floor(145 - goalW / 2)), top: A(21) }}
            data-testid="bk-goal"
          >
            <PixelText s={s} navy parts={goalParts} />
          </div>

          <div data-testid="bk-seats-top">
            {topSeats.map((i, k) => tag(players[i]!, top[k]!, cardsY))}
          </div>

          {/* the board and its hard navy drop shadow */}
          <div
            className="absolute"
            style={{
              left: (A(SCREEN_W) - totalPx) / 2,
              top: A(boardTop),
              width: boardPx,
            }}
          >
            <div
              className="absolute bg-[#101628]"
              style={{ left: 2 * bs, top: boardPx, width: 259 * bs, height: 4 * bs }}
            />
            <div
              className="absolute bg-[#101628]"
              style={{ left: boardPx, top: 2 * bs, width: 4 * bs, height: 255 * bs }}
            />
            <Board
              state={ui}
              shown={shown}
              onTile={(id) => {
                play('tap');
                setTileOpen(id);
              }}
              pulse={pulse}
              picked={pick}
              overlay={popupNode}
              clear={
                tradeOn || auctionOn || bailOn || swapping || rainbowing || winShow || noDealShow
              }
              upgradable={upgradable}
              cantAfford={cantAfford}
              flash={landBlink ? landTile : null}
              police={police}
              onPulse={(id) => {
                play('tap');
                setPick(id === pick ? null : id);
              }}
            >
              {/* the town plaza with the wheel (the wheel is the die: it spins onto what the game rolled) */}
              <div
                className="absolute"
                style={{ left: bp(32), top: bp(32), width: bp(193), height: bp(193) }}
                data-testid="bk-dice"
              >
                <Plaza
                  idleSlices={idleSlices}
                  spin={spin}
                  onBlink={setLandBlink}
                  tappable={rollReady}
                  onTap={() => {
                    setTileOpen(null);
                    void send({ type: 'roll' });
                  }}
                />
              </div>
            </Board>
          </div>

          <div data-testid="bk-seats-bottom">
            {extras.map((i, k) => tag(players[i]!, extraXs[k]!, rowY - CARD_H - 3))}
            {tag(players[around[0]!]!, 0, rowY)}
          </div>

          {/* the Roll button and the padlock for rolling automatically: two yellow pixel panels (navy border, light
              top row, solid navy shadow under them), as in the layout */}
          <button
            type="button"
            data-testid="bk-roll"
            aria-label="Spin the wheel"
            disabled={!rollReady}
            onClick={() => {
              setTileOpen(null); // an open space card closes when I roll
              void send({ type: 'roll' });
            }}
            className={`absolute block active:translate-y-px disabled:active:translate-y-0 ${rollReady ? '' : 'opacity-60 grayscale'}`}
            style={{ left: A(96), top: A(rowY + 1), width: A(151), height: A(45) }}
          >
            <PixelPanel s={s} w={151} h={42} shadow={3} fill="#fdcf51" />
            <span
              className="absolute left-0 top-0 flex items-center justify-center"
              style={{ width: A(151), height: A(42) }}
            >
              <PixelText s={s} k={4} parts={[{ text: 'SPIN', colour: '#101628' }]} />
            </span>
          </button>
          {canAct && (
            <button
              type="button"
              data-testid="bk-roll-lock"
              aria-pressed={autoRoll}
              aria-label={autoRoll ? 'Stop rolling automatically' : 'Roll automatically'}
              onClick={() => {
                play('tap');
                setAutoRoll((v) => !v);
              }}
              className="absolute block active:translate-y-px"
              style={{ left: A(251), top: A(rowY + 1), width: A(29), height: A(45) }}
            >
              <PixelPanel s={s} w={29} h={42} shadow={3} fill={autoRoll ? '#101628' : '#fdcf51'} />
              <span
                className={`absolute left-0 top-0 flex items-center justify-center ${autoRoll ? 'text-[#fdcf51]' : 'text-[#101628]'}`}
                style={{ width: A(29), height: A(42) }}
              >
                <LockIcon open={!autoRoll} style={{ width: A(14), height: A(14) }} />
              </span>
            </button>
          )}
          {/* the last three things that happened, under the Roll row: newest on top and brightest, wrapped to fit */}
          <div
            className="absolute flex flex-col items-center"
            style={{ left: 0, width: A(SCREEN_W), top: A(rowY + CARD_H + 5), gap: A(2) }}
            data-testid="bk-note"
            role="status"
          >
            {(log.length ? log.map((e) => `${e.who}: ${e.parts.join(' · ')}`) : [rollMessage]).map(
              (text, i) => (
                <div
                  key={`${i}-${text}`}
                  className="flex flex-col items-center"
                  style={{ opacity: 1 - i * 0.1, gap: A(2) }}
                >
                  {wrap(text, 270).map((line, j) => (
                    <PixelText key={j} s={s} parts={[{ text: line, colour: '#f7f1e4' }]} />
                  ))}
                </div>
              ),
            )}
          </div>
          {/* the turn marker: a little arrow over my card when it is my turn */}
          {myTurn && !finished && (
            <svg
              aria-hidden
              data-testid="bk-turn-marker"
              className="absolute"
              style={{ left: A(44), top: A(rowY - 5), width: A(5), height: A(3) }}
              viewBox="0 0 5 3"
              shapeRendering="crispEdges"
            >
              <path d="M0 0h5v1h-5zM1 1h3v1h-3zM2 2h1v1h-1z" fill="#fda200" />
            </svg>
          )}
          {/* whose turn it is (and the debt warning): above my row, between the board and the cards */}
          <div
            className="absolute flex w-full flex-col items-center justify-end gap-1"
            style={{
              top: A((extras.length ? rowY - CARD_H - 3 : rowY) - 22),
              height: A(19),
            }}
            data-testid="bk-actions"
          >
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
