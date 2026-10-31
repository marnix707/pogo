import { useEffect, useState } from 'react';
import { bankrupt } from '@pogo/shared';
import { Button, Sheet } from '../../components/ui';
import { money } from './Board';

type State = bankrupt.BankruptState;

const TILE_CHIP = 'rounded-md border-2 px-2 py-1 text-xs font-bold uppercase';

/** Pick a player, what each side gives and some cash; both players get the bank's bonus when it is accepted. */
export function TradeSheet({
  state,
  me,
  open,
  name,
  send,
  onClose,
}: {
  state: State;
  me: string;
  open: boolean;
  name: (id: string) => string;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  onClose: () => void;
}) {
  const others = state.players.filter((p) => p.id !== me && !p.bankrupt);
  const [to, setTo] = useState<string | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [take, setTake] = useState<string[]>([]);
  const [cash, setCash] = useState(0);
  useEffect(() => {
    if (open) {
      setTo(others[0]?.id ?? null);
      setGive([]);
      setTake([]);
      setCash(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const free = (owner: string | null) =>
    owner
      ? bankrupt.holdingsOf(state, owner).filter((t) => (state.owned[t.id]?.level ?? 0) === 0)
      : [];
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const chip = (t: bankrupt.OwnableTile, on: boolean, id: string, onTap: () => void) => (
    <button
      key={t.id}
      type="button"
      data-testid={id}
      aria-pressed={on}
      onClick={onTap}
      className={`${TILE_CHIP} ${on ? 'border-accent bg-accent text-accentink' : 'border-edge/50 text-ink'}`}
      style={
        t.kind === 'property' && !on ? { borderLeftColor: t.color, borderLeftWidth: 6 } : undefined
      }
    >
      {t.name}
    </button>
  );
  const myCash = state.players.find((p) => p.id === me)?.cash ?? 0;
  const theirCash = state.players.find((p) => p.id === to)?.cash ?? 0;
  const empty = give.length + take.length === 0 && cash === 0;
  const canSend =
    !!to && !empty && (cash <= 0 || myCash >= cash) && (cash >= 0 || theirCash >= -cash);

  return (
    <Sheet open={open} onClose={onClose} title="Trade">
      <div
        className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto"
        data-testid="bk-trade-sheet"
      >
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`bk-trade-to-${p.id}`}
              aria-pressed={to === p.id}
              onClick={() => {
                setTo(p.id);
                setTake([]);
              }}
              className={`${TILE_CHIP} ${to === p.id ? 'border-neon bg-neon text-accentink' : 'border-edge/50'}`}
            >
              {name(p.id)}
            </button>
          ))}
        </div>
        <section>
          <h3 className="label mb-1 text-muted">You give</h3>
          <div className="flex flex-wrap gap-1.5">
            {free(me).length === 0 && <span className="text-sm text-muted">No free spaces</span>}
            {free(me).map((t) =>
              chip(t, give.includes(t.id), `bk-trade-give-${t.id}`, () =>
                toggle(give, setGive, t.id),
              ),
            )}
          </div>
        </section>
        <section>
          <h3 className="label mb-1 text-muted">You get</h3>
          <div className="flex flex-wrap gap-1.5">
            {free(to).length === 0 && <span className="text-sm text-muted">No free spaces</span>}
            {free(to).map((t) =>
              chip(t, take.includes(t.id), `bk-trade-take-${t.id}`, () =>
                toggle(take, setTake, t.id),
              ),
            )}
          </div>
        </section>
        <section className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            className="!px-3"
            data-testid="bk-trade-less"
            onClick={() => setCash((c) => c - 50)}
          >
            -$50
          </Button>
          <span className="text-center text-sm font-bold" data-testid="bk-trade-cash">
            {cash === 0
              ? 'No cash'
              : cash > 0
                ? `You add ${money(cash)}`
                : `They add ${money(-cash)}`}
          </span>
          <Button
            variant="secondary"
            className="!px-3"
            data-testid="bk-trade-more"
            onClick={() => setCash((c) => c + 50)}
          >
            +$50
          </Button>
        </section>
        <p className="text-center text-xs text-muted">
          When it is accepted you both get {money(state.board.tradeBonus)} from the bank.
        </p>
        <Button
          variant="gold"
          data-testid="bk-trade-send"
          disabled={!canSend}
          onClick={() => {
            if (!to) return;
            void send({ type: 'proposeTrade', to, give, take, cash });
            onClose();
          }}
        >
          Send offer
        </Button>
      </div>
    </Sheet>
  );
}

/** The offer on the table: what moves, with Accept / Decline for the player it is for (Cancel for the sender). */
export function TradeOffer({
  state,
  me,
  name,
  send,
  busy,
}: {
  state: State;
  me: string;
  name: (id: string) => string;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  busy: boolean;
}) {
  const t = state.trade!;
  const tileName = (id: string) => state.board.tiles.find((x) => x.id === id)?.name ?? id;
  const list = (ids: string[]) => (ids.length ? ids.map(tileName).join(', ') : 'nothing');
  const cash = t.cash === 0 ? '' : t.cash > 0 ? ` + ${money(t.cash)}` : ` - ${money(-t.cash)}`;
  return (
    <div className="flex flex-col gap-2" data-testid="bk-trade-offer">
      <p className="text-center text-sm">
        <b>{name(t.from)}</b> gives <b>{list(t.give)}</b>
        {t.cash > 0 ? ` and ${money(t.cash)}` : ''} for <b>{list(t.take)}</b>
        {t.cash < 0 ? ` and ${money(-t.cash)}` : ''}
        <span className="sr-only">{cash}</span>. You both get {money(state.board.tradeBonus)}.
      </p>
      {t.to === me ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="gold"
            data-testid="bk-trade-accept"
            disabled={busy}
            onClick={() => void send({ type: 'acceptTrade' })}
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            data-testid="bk-trade-decline"
            disabled={busy}
            onClick={() => void send({ type: 'declineTrade' })}
          >
            Decline
          </Button>
        </div>
      ) : t.from === me ? (
        <Button
          variant="secondary"
          data-testid="bk-trade-cancel"
          disabled={busy}
          onClick={() => void send({ type: 'cancelTrade' })}
        >
          Cancel offer
        </Button>
      ) : (
        <p className="label text-center text-onbg/80">{name(t.to)} is deciding…</p>
      )}
    </div>
  );
}
