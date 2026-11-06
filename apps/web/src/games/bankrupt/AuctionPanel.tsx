import { bankrupt } from '@pogo/shared';
import { Button } from '../../components/ui';
import { useCountdown } from '../../lib/useCountdown';
import { money } from './Board';

type State = bankrupt.BankruptState;

/**
 * The auction, in the middle of the board (the hall and the die have moved away). One player is up at a time:
 * the leader (the highest bid) is on top, highlighted, the others stand under them with their own bids or
 * "passed". Only the player whose turn it is can bid higher or step out.
 */
export function AuctionPanel({
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
  const step = bankrupt.bidStep(price);
  const base = a.high?.amount ?? a.min - step;
  const myTurn = a.turn === me;
  const left = useCountdown(deadline, serverTime);
  const alive = state.players.filter((p) => !p.bankrupt);
  const others = alive
    .filter((p) => p.id !== a.high?.player)
    // the ones with a bid first (highest on top), then the rest in seat order
    .sort((x, y) => (a.bids[y.id] ?? 0) - (a.bids[x.id] ?? 0));
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-between gap-[1.2cqw] bg-[#101628] p-[3cqw] text-white"
      data-testid="bk-auction"
      role="dialog"
      aria-label="Auction"
    >
      <p className="label text-center text-[3.6cqw] font-black uppercase leading-none text-neon">
        Auction:{' '}
        <b
          className={tile?.kind === 'property' ? '' : 'text-white'}
          style={tile?.kind === 'property' ? { color: tile.color } : undefined}
          data-testid="bk-auction-name"
        >
          {tile?.name}
        </b>
        {left !== null && (
          <span
            className={`ml-[2cqw] tabular-nums ${left <= 5 ? 'text-[#ff8f73]' : 'text-white/80'}`}
            data-testid="bk-auction-timer"
          >
            {left}s
          </span>
        )}
      </p>

      {/* the leader */}
      <div
        className="flex w-full items-center justify-between rounded-[0.8cqw] border-[0.5cqw] border-[#fdcf51] bg-[#fdcf51]/20 px-[2.5cqw] py-[1.4cqw]"
        data-testid="bk-high-bid"
      >
        {a.high ? (
          <>
            <span className="label flex items-center gap-[1.5cqw] text-[3cqw] leading-none text-[#fdcf51]">
              <span aria-hidden>▲</span>
              {name(a.high.player)}
            </span>
            <span className="label text-[4cqw] font-black leading-none text-[#fdcf51]">
              {money(a.high.amount)}
            </span>
          </>
        ) : (
          <span className="label mx-auto text-[2.6cqw] leading-none text-white/80">
            No bids yet · opens at {money(a.min)}
          </span>
        )}
      </div>

      {/* everybody else */}
      <ul className="flex w-full flex-col gap-[0.8cqw]" data-testid="bk-auction-list">
        {others.map((p) => {
          const passed = a.passed.includes(p.id);
          const up = a.turn === p.id;
          const bid = a.bids[p.id];
          return (
            <li
              key={p.id}
              data-testid={`bk-auction-row-${p.id}`}
              data-passed={passed}
              data-up={up}
              className={`flex items-center justify-between rounded-[0.6cqw] px-[2.5cqw] py-[0.9cqw] ${
                up ? 'bg-white/15 ring-[0.3cqw] ring-white/60' : 'bg-white/5'
              } ${passed ? 'opacity-45' : ''}`}
            >
              <span className="label flex items-center gap-[1.5cqw] text-[2.6cqw] leading-none">
                <span aria-hidden className={up ? '' : 'invisible'}>
                  ▶
                </span>
                {name(p.id)}
                {p.id === me ? ' (you)' : ''}
              </span>
              <span
                className={`label text-[2.6cqw] leading-none ${passed ? 'text-[#ff8f73]' : ''}`}
              >
                {passed ? 'PASSED' : bid ? money(bid) : up ? 'bidding…' : '–'}
              </span>
            </li>
          );
        })}
      </ul>

      {/* the buttons: they only work on your turn */}
      <div className="flex w-full flex-col gap-[1.2cqw]">
        <p
          className="label text-center text-[2.4cqw] leading-none text-white/80"
          data-testid="bk-auction-hint"
        >
          {myTurn
            ? 'Your turn: bid higher or pass'
            : a.passed.includes(me)
              ? 'You stepped out'
              : a.high?.player === me
                ? 'You have the highest bid'
                : `Waiting for ${name(a.turn)}…`}
        </p>
        <div className="grid grid-cols-3 gap-[1.5cqw]">
          {[1, 2, 5].map((k) => {
            const amount = base + k * step;
            const off = busy || !myTurn || amount > cash;
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
          disabled={busy || !myTurn}
          onClick={() => void send({ type: 'passBid' })}
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
