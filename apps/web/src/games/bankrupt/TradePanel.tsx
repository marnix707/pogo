import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { bankrupt } from '@pogo/shared';
import { Button } from '../../components/ui';
import { useCountdown } from '../../lib/useCountdown';
import { MiniCard } from './MiniCard';

type State = bankrupt.BankruptState;
type Send = (m: bankrupt.BankruptMove) => Promise<void>;

const tradableOf = (state: State, id: string) =>
  bankrupt.holdingsOf(state, id).filter((x) => (state.owned[x.id]?.level ?? 0) === 0);

/** The spaces that pulse on the board: what the player may offer right now. */
export function pulsingTiles(state: State, me: string): Set<string> {
  const t = state.trade;
  if (!t) return new Set();
  const mine = () => new Set(tradableOf(state, me).map((x) => x.id));
  if (t.stage === 'pick' && t.by === me) return mine();
  if (t.stage === 'offers' && t.by !== me && !(me in t.offers)) return mine();
  return new Set();
}

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A card-shaped box: the miniature card, an X (passed), dots (still choosing) or an empty trading spot. */
function Slot({
  state,
  tile,
  mark,
  w,
  caption,
  testId,
  innerRef,
}: {
  state: State;
  tile?: string | null;
  mark?: 'pass' | 'wait' | 'empty';
  w: number;
  caption?: string;
  testId?: string;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  const t = tile ? state.board.tiles.find((x) => x.id === tile) : undefined;
  return (
    <div className="flex flex-col items-center gap-[0.6cqw]" data-testid={testId}>
      <div ref={innerRef} style={{ width: `${w}cqw` }}>
        {t && bankrupt.isOwnable(t) ? (
          <MiniCard tile={t} width={w} />
        ) : (
          <div
            className={`flex items-center justify-center rounded-[0.8cqw] border-[0.5cqw] ${
              mark === 'pass'
                ? 'border-[#ff6b57] text-[#ff6b57]'
                : 'border-dashed border-white/40 text-white/60'
            }`}
            style={{ width: `${w}cqw`, aspectRatio: '152 / 195', fontSize: `${w * 0.4}cqw` }}
            data-mark={mark ?? 'empty'}
          >
            <b className="leading-none">{mark === 'pass' ? '✕' : mark === 'wait' ? '…' : ''}</b>
          </div>
        )}
      </div>
      {caption !== undefined && (
        <span className="label max-w-[20cqw] truncate text-[2cqw] leading-none text-white">
          {caption}
        </span>
      )}
    </div>
  );
}

/** The swapping arrow (pointing both ways), in the pixel style. */
export function SwapArrow({ w = 9 }: { w?: number }) {
  return (
    <svg
      viewBox="0 0 17 9"
      shapeRendering="crispEdges"
      style={{ width: `${w}cqw` }}
      aria-hidden
      data-testid="bk-swap-arrow"
    >
      <polygon
        points="0,4.5 4,0.5 4,3 13,3 13,0.5 17,4.5 13,8.5 13,6 4,6 4,8.5"
        fill="#fdcf51"
        stroke="#101628"
        strokeWidth="0.6"
      />
    </svg>
  );
}

function Actions({
  left,
  right,
}: {
  left: { label: string; testId: string; disabled?: boolean; onClick: () => void };
  right: { label: string; testId: string; disabled?: boolean; onClick: () => void };
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-[2cqw]" data-testid="bk-trade-actions">
      <Button
        variant="secondary"
        data-testid={left.testId}
        disabled={left.disabled}
        onClick={left.onClick}
      >
        {left.label}
      </Button>
      <Button
        variant="gold"
        data-testid={right.testId}
        disabled={right.disabled}
        onClick={right.onClick}
      >
        {right.label}
      </Button>
    </div>
  );
}

function Frame({
  title,
  timer,
  children,
  actions,
}: {
  title: string;
  timer: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-between gap-[1.5cqw] p-[3cqw]">
      <p
        className="label text-center text-[4.2cqw] font-black uppercase leading-none text-neon"
        data-testid="bk-trade"
      >
        {title}
        {timer}
      </p>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[2cqw]">
        {children}
      </div>
      {actions}
    </div>
  );
}

/**
 * The trade on the Auction corner, all in the middle of the board (the hall and the die have moved away).
 * The mover picks a space of theirs, the others see it and answer with one of theirs (or pass), and the mover
 * takes one of the offers. Tapping a glowing space on the board chooses it.
 */
function TradeBody({
  state,
  me,
  name,
  send,
  busy,
  deadline,
  serverTime,
  pick,
  onClearPick,
}: {
  state: State;
  me: string;
  name: (id: string) => string;
  send: Send;
  busy: boolean;
  deadline: number | null;
  serverTime: number;
  /** The space tapped on the board, waiting for the confirmation. */
  pick: string | null;
  onClearPick: () => void;
}) {
  const t = state.trade!;
  const left = useCountdown(deadline, serverTime);
  const [choice, setChoice] = useState<string | null>(null);
  const offerEls = useRef<Record<string, HTMLDivElement | null>>({});
  const spotEl = useRef<HTMLDivElement | null>(null);
  // The offer I tapped flies up to the trading spot.
  useLayoutEffect(() => {
    if (!choice || reduced()) return;
    const from = offerEls.current[choice]?.getBoundingClientRect();
    const to = spotEl.current?.getBoundingClientRect();
    if (!from || !to || to.width === 0) return;
    spotEl.current!.animate(
      [
        {
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
          transformOrigin: 'top left',
        },
        { transform: 'none', transformOrigin: 'top left' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)' },
    );
  }, [choice]);

  const iAmMover = t.by === me;
  const traders = bankrupt
    .alivePlayers(state)
    .filter((p) => p.id !== t.by && tradableOf(state, p.id).length > 0);
  const iTrade = traders.some((p) => p.id === me);
  const timer =
    left !== null && t.stage !== 'pick' ? (
      <span
        className={`ml-[2cqw] tabular-nums ${left <= 10 ? 'text-[#ff8f73]' : 'text-white/80'}`}
        data-testid="bk-trade-timer"
      >
        {left}s
      </span>
    ) : null;
  const note = (text: string) => (
    <p className="label text-center text-[2.4cqw] leading-tight text-white">{text}</p>
  );
  const iPassed = me in t.offers && t.offers[me] === null;
  const myOffer = t.offers[me] ?? null;
  const cancel = {
    label: 'Pass',
    testId: 'bk-trade-cancel',
    disabled: busy,
    onClick: () => void send({ type: 'tradeCancel' }),
  };

  // ---- the mover chooses a space to offer
  if (t.stage === 'pick') {
    if (iAmMover)
      return (
        <Frame
          title="Choose property"
          timer={timer}
          actions={
            <Actions
              left={cancel}
              right={{
                label: 'Confirm',
                testId: 'bk-trade-confirm',
                disabled: busy || !pick,
                onClick: () => {
                  void send({ type: 'tradePick', tile: pick! });
                  onClearPick();
                },
              }}
            />
          }
        >
          <Slot state={state} tile={pick} mark="empty" w={22} />
          {note(pick ? 'Confirm to offer this one.' : 'Tap one of your glowing spaces.')}
        </Frame>
      );
    return (
      <Frame
        title={`${name(t.by)} is picking…`}
        timer={timer}
        actions={
          iTrade ? (
            <Actions
              left={{
                label: 'Pass',
                testId: 'bk-trade-pass',
                disabled: busy || iPassed,
                onClick: () => void send({ type: 'tradePass' }),
              }}
              right={{
                label: 'Confirm',
                testId: 'bk-trade-confirm',
                disabled: true,
                onClick: () => {},
              }}
            />
          ) : undefined
        }
      >
        <Slot state={state} mark={iPassed ? 'pass' : 'wait'} w={22} />
        {note(
          !iTrade
            ? 'You have nothing to trade.'
            : iPassed
              ? 'You do not want to trade.'
              : 'Pass if you do not want to trade.',
        )}
      </Frame>
    );
  }

  // ---- everybody answers
  if (t.stage === 'offers') {
    if (iAmMover)
      return (
        <Frame
          title="Waiting for offers"
          timer={timer}
          actions={
            <Actions
              left={cancel}
              right={{
                label: 'Confirm',
                testId: 'bk-trade-confirm',
                disabled: true,
                onClick: () => {},
              }}
            />
          }
        >
          <Slot state={state} tile={t.give} w={17} caption="Your offer" />
          <div
            className="flex flex-wrap items-start justify-center gap-[2cqw]"
            data-testid="bk-trade-status"
          >
            {traders.map((p) => (
              <Slot
                key={p.id}
                state={state}
                w={13}
                caption={name(p.id)}
                tile={t.offers[p.id] ?? null}
                mark={!(p.id in t.offers) ? 'wait' : t.offers[p.id] ? undefined : 'pass'}
              />
            ))}
          </div>
        </Frame>
      );
    const answered = me in t.offers;
    const mine = answered ? myOffer : iTrade ? pick : null;
    return (
      <Frame
        title={iTrade ? `Trade with ${name(t.by)}` : `${name(t.by)} offers a trade`}
        timer={timer}
        actions={
          iTrade ? (
            <Actions
              left={{
                label: 'Pass',
                testId: 'bk-trade-pass',
                disabled: busy || answered,
                onClick: () => void send({ type: 'tradePass' }),
              }}
              right={{
                label: 'Confirm',
                testId: 'bk-trade-confirm',
                disabled: busy || answered || !pick,
                onClick: () => {
                  void send({ type: 'tradeOffer', tile: pick! });
                  onClearPick();
                },
              }}
            />
          ) : undefined
        }
      >
        <div className="flex items-center justify-center gap-[2cqw]">
          <Slot state={state} tile={t.give} w={18} caption={name(t.by)} />
          <SwapArrow />
          <Slot
            state={state}
            tile={mine}
            w={18}
            mark={iPassed ? 'pass' : 'empty'}
            caption={iTrade ? 'You' : undefined}
          />
        </div>
        {note(
          !iTrade
            ? 'You have nothing to trade.'
            : answered
              ? 'Waiting for the others…'
              : pick
                ? 'Confirm to offer this one.'
                : 'Tap one of your glowing spaces, or pass.',
        )}
      </Frame>
    );
  }

  // ---- the mover takes one of the offers
  const offers = traders.map((p) => [p.id, t.offers[p.id] ?? null] as const);
  if (iAmMover) {
    const taken = choice && t.offers[choice] ? t.offers[choice] : null;
    return (
      <Frame
        title="Pick your trade"
        timer={timer}
        actions={
          <Actions
            left={{
              label: 'Pass',
              testId: 'bk-trade-none',
              disabled: busy,
              onClick: () => void send({ type: 'tradeCancel' }),
            }}
            right={{
              label: 'Trade',
              testId: 'bk-trade-take',
              disabled: busy || !choice || !taken,
              onClick: () => void send({ type: 'tradeAccept', from: choice! }),
            }}
          />
        }
      >
        <div className="flex items-center justify-center gap-[2cqw]">
          <Slot state={state} tile={t.give} w={16} caption="You" />
          <SwapArrow w={8} />
          <Slot
            state={state}
            tile={taken}
            w={16}
            mark="empty"
            innerRef={(el) => (spotEl.current = el)}
            caption={choice ? name(choice) : undefined}
            testId="bk-trade-spot"
          />
        </div>
        <div
          className="flex flex-wrap items-start justify-center gap-[2cqw]"
          data-testid="bk-trade-offers"
        >
          {offers.map(([id, tile]) =>
            tile ? (
              <button
                key={id}
                type="button"
                data-testid={`bk-trade-offer-${id}`}
                onClick={() => setChoice(id)}
                className={`rounded-[0.8cqw] p-[0.4cqw] ${choice === id ? 'opacity-40' : 'ring-[0.4cqw] ring-transparent hover:ring-neon'}`}
              >
                <Slot
                  state={state}
                  tile={tile}
                  w={12}
                  caption={name(id)}
                  innerRef={(el) => (offerEls.current[id] = el)}
                />
              </button>
            ) : (
              <Slot key={id} state={state} w={12} mark="pass" caption={name(id)} />
            ),
          )}
        </div>
      </Frame>
    );
  }
  return (
    <Frame title={`${name(t.by)} is choosing…`} timer={timer}>
      <div className="flex items-center justify-center gap-[2cqw]">
        <Slot state={state} tile={t.give} w={18} caption={name(t.by)} />
        <SwapArrow />
        <Slot
          state={state}
          tile={myOffer}
          w={18}
          mark={iPassed ? 'pass' : 'empty'}
          caption={iTrade ? 'You' : undefined}
        />
      </div>
    </Frame>
  );
}

/** The trade, in the middle of the board: a pop-up that never covers a space (the glowing spaces stay tappable). */
export function TradePanel(props: Parameters<typeof TradeBody>[0]) {
  return (
    <div
      className="bk-pop h-full w-full overflow-hidden bg-[#101628] text-white [&_button]:!min-h-[6.5cqw] [&_button]:!text-[2.6cqw]"
      data-testid="bk-trade-box"
    >
      <TradeBody {...props} />
    </div>
  );
}

/** The trade went through: the two cards swap places (the owners change on the board right after). */
export function TradeSwap({ state, name }: { state: State; name: (id: string) => string }) {
  const e = state.events.find((x) => x.k === 'trade');
  if (!e || e.k !== 'trade') return null;
  const card = (id: string, who: string, dx: number, dy: number) => {
    const tile = state.board.tiles.find((x) => x.id === id);
    if (!tile || !bankrupt.isOwnable(tile)) return null;
    return (
      <div
        className="bk-swap flex flex-col items-center gap-[1cqw]"
        style={{ ['--dx' as string]: `${dx}cqw`, ['--dy' as string]: `${dy}cqw` }}
      >
        <MiniCard tile={tile} width={20} />
        <span className="label text-[2.4cqw] leading-none text-white">{name(who)}</span>
      </div>
    );
  };
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-center gap-[3cqw] bg-[#101628]"
      data-testid="bk-trade-swap"
      role="status"
    >
      <p className="label text-[4.2cqw] font-black uppercase leading-none text-neon">Traded!</p>
      <div className="flex w-[80%] items-center justify-between">
        {card(e.give, e.by, 40, -6)}
        {card(e.take, e.with, -40, 6)}
      </div>
    </div>
  );
}
