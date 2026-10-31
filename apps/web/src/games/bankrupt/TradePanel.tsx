import { useState } from 'react';
import { bankrupt } from '@pogo/shared';
import { Button } from '../../components/ui';
import { useCountdown } from '../../lib/useCountdown';
import { money } from './Board';

type State = bankrupt.BankruptState;
type Send = (m: bankrupt.BankruptMove) => Promise<void>;

/** The spaces that pulse on the board: what the player may offer right now. */
export function pulsingTiles(state: State, me: string): Set<string> {
  const t = state.trade;
  if (!t) return new Set();
  const mine = () =>
    new Set(
      bankrupt
        .holdingsOf(state, me)
        .filter((x) => (state.owned[x.id]?.level ?? 0) === 0)
        .map((x) => x.id),
    );
  if (t.stage === 'pick' && t.by === me) return mine();
  if (t.stage === 'offers' && t.by !== me && !(me in t.offers)) return mine();
  return new Set();
}

/** A space as a small chip (its colour and name); tap it to see its card. */
function Chip({ state, id, open }: { state: State; id: string; open: (id: string) => void }) {
  const tile = state.board.tiles.find((t) => t.id === id);
  if (!tile) return null;
  return (
    <button
      type="button"
      onClick={() => open(id)}
      data-testid={`bk-chip-${id}`}
      className="inline-flex items-center gap-1 rounded-md border-2 border-edge/50 bg-panel2 px-1.5 py-0.5 text-xs font-bold uppercase"
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-sm border border-[#101628]"
        style={{ background: tile.kind === 'property' ? tile.color : '#c9bfa8' }}
      />
      {tile.name}
    </button>
  );
}

/**
 * The trade on the Auction corner, in the action area under the board (so it never covers a space): the
 * mover picks one of their pulsing spaces, the others offer one of theirs (or pass), and the mover chooses.
 */
function TradeBody({
  state,
  me,
  name,
  send,
  busy,
  deadline,
  serverTime,
  open,
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
  open: (id: string) => void;
  /** The space tapped on the board, waiting for the confirmation. */
  pick: string | null;
  onClearPick: () => void;
}) {
  const t = state.trade!;
  const [accept, setAccept] = useState<string | null>(null);
  // The confirmation of the chosen space: nothing is offered by one tap.
  const confirm = (type: 'tradePick' | 'tradeOffer', text: string) => (
    <div className="flex flex-col gap-2" data-testid="bk-trade-confirm-box">
      <p className="text-center text-sm">
        {text} <Chip state={state} id={pick!} open={open} />?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="gold"
          data-testid="bk-trade-confirm"
          disabled={busy}
          onClick={() => {
            void send({ type, tile: pick! });
            onClearPick();
          }}
        >
          Confirm
        </Button>
        <Button variant="secondary" data-testid="bk-trade-change" onClick={onClearPick}>
          Change
        </Button>
      </div>
    </div>
  );
  const left = useCountdown(deadline, serverTime);
  const iAmMover = t.by === me;
  const others = bankrupt
    .alivePlayers(state)
    .filter(
      (p) =>
        p.id !== t.by &&
        bankrupt.holdingsOf(state, p.id).some((x) => (state.owned[x.id]?.level ?? 0) === 0),
    );
  const timer = left !== null && (
    <span
      className={`ml-2 tabular-nums ${left <= 10 ? 'text-[#ff8f73]' : 'text-onbg/80'}`}
      data-testid="bk-trade-timer"
    >
      {left}s
    </span>
  );
  const head = (
    <p className="label text-center" data-testid="bk-trade">
      Trade{timer}
    </p>
  );

  if (t.stage === 'pick') {
    return iAmMover ? (
      <div className="flex flex-col gap-2" data-testid="bk-trade-panel">
        {head}
        {pick ? (
          confirm('tradePick', 'Offer')
        ) : (
          <p className="text-center text-sm">
            Tap one of your pulsing spaces to offer it for a trade.
          </p>
        )}
        <Button
          variant="secondary"
          data-testid="bk-trade-cancel"
          disabled={busy}
          onClick={() => void send({ type: 'tradeCancel' })}
        >
          Cancel trade
        </Button>
      </div>
    ) : (
      <div data-testid="bk-trade-panel">
        {head}
        <p className="text-center text-sm">{name(t.by)} is choosing a space to trade…</p>
      </div>
    );
  }

  if (t.stage === 'offers') {
    const answered = me in t.offers;
    return (
      <div className="flex flex-col gap-2" data-testid="bk-trade-panel">
        {head}
        <p className="text-center text-sm">
          {name(t.by)} offers <Chip state={state} id={t.give!} open={open} />
        </p>
        {iAmMover ? (
          <>
            <ul className="flex flex-col gap-1 text-sm" data-testid="bk-trade-status">
              {others.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>{name(p.id)}</span>
                  {p.id in t.offers ? (
                    t.offers[p.id] ? (
                      <Chip state={state} id={t.offers[p.id]!} open={open} />
                    ) : (
                      <span className="text-onbg/70">passed</span>
                    )
                  ) : (
                    <span className="text-onbg/70">choosing…</span>
                  )}
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              data-testid="bk-trade-cancel"
              disabled={busy}
              onClick={() => void send({ type: 'tradeCancel' })}
            >
              Cancel trade
            </Button>
          </>
        ) : answered ? (
          <p className="text-center text-sm text-onbg/80">
            {t.offers[me]
              ? 'Offer sent. Waiting for the others…'
              : 'You passed. Waiting for the others…'}
          </p>
        ) : bankrupt.holdingsOf(state, me).some((x) => (state.owned[x.id]?.level ?? 0) === 0) ? (
          <>
            {pick ? (
              confirm('tradeOffer', 'Trade')
            ) : (
              <p className="text-center text-sm">
                Tap one of your pulsing spaces to trade for it, or pass.
              </p>
            )}
            <Button
              variant="secondary"
              data-testid="bk-trade-pass"
              disabled={busy}
              onClick={() => void send({ type: 'tradePass' })}
            >
              Pass
            </Button>
          </>
        ) : (
          <p className="text-center text-sm text-onbg/80">You have nothing to trade.</p>
        )}
      </div>
    );
  }

  // choose
  const offers = Object.entries(t.offers).filter(([, tile]) => tile !== null) as [string, string][];
  return iAmMover ? (
    <div className="flex flex-col gap-2" data-testid="bk-trade-panel">
      {head}
      <p className="text-center text-sm">
        Your <Chip state={state} id={t.give!} open={open} /> for:
      </p>
      <ul className="flex flex-col gap-1.5" data-testid="bk-trade-offers">
        {offers.map(([id, tile]) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm">
              {name(id)} <Chip state={state} id={tile} open={open} />
            </span>
            {accept === id ? (
              <span className="flex gap-1.5">
                <Button
                  variant="gold"
                  className="!min-h-9 !px-3 text-xs"
                  data-testid={`bk-trade-accept-${id}`}
                  disabled={busy}
                  onClick={() => void send({ type: 'tradeAccept', from: id })}
                >
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-9 !px-2 text-xs"
                  onClick={() => setAccept(null)}
                >
                  Back
                </Button>
              </span>
            ) : (
              <Button
                variant="gold"
                className="!min-h-9 !px-3 text-xs"
                data-testid={`bk-trade-take-${id}`}
                disabled={busy}
                onClick={() => setAccept(id)}
              >
                Trade
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-center text-[10px] text-onbg/70">
        You both get {money(state.board.tradeBonus)} from the bank.
      </p>
      <Button
        variant="secondary"
        data-testid="bk-trade-none"
        disabled={busy}
        onClick={() => void send({ type: 'tradeCancel' })}
      >
        Pass
      </Button>
    </div>
  ) : (
    <div data-testid="bk-trade-panel">
      {head}
      <p className="text-center text-sm">{name(t.by)} is choosing an offer…</p>
    </div>
  );
}

/**
 * The trade, in the middle of the board (a pop-up like the cards: it never covers a space, and the pulsing spaces
 * around it stay tappable).
 */
export function TradePanel(props: Parameters<typeof TradeBody>[0]) {
  return (
    <div
      className="flex h-full w-full flex-col justify-center overflow-y-auto bg-[#101628]/85 p-[3%] text-white [&_button]:!min-h-9 [&_button]:!text-xs"
      data-testid="bk-trade-box"
    >
      <TradeBody {...props} />
    </div>
  );
}
