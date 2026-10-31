import type { bankrupt } from '@pogo/shared';
import { money } from './Board';
import { PropertyCard } from './PropertyCard';

/** You stopped on a space nobody owns: its card pops up with Buy; the X (cancel) leaves it or auctions it. */
export function BuyOverlay({
  state,
  me,
  tile,
  busy,
  send,
}: {
  state: bankrupt.BankruptState;
  me: string;
  tile: bankrupt.OwnableTile;
  busy: boolean;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
}) {
  const cash = state.players.find((p) => p.id === me)?.cash ?? 0;
  const canBuy = cash >= tile.price;
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center gap-[1%] bg-[#101628]/70 p-[1.5%]"
      data-testid="bk-buy-overlay"
      role="dialog"
      aria-label={`Buy ${tile.name}?`}
    >
      <div className="min-h-0 w-full flex-1">
        <PropertyCard
          tile={tile}
          level={0}
          rent={tile.rent[0]!}
          closeLabel="Cancel"
          onClose={() => void send({ type: 'decline' })}
          actions={[
            {
              kind: 'buy',
              enabled: canBuy && !busy,
              testId: 'bk-buy',
              label: `Buy ${tile.name} for ${money(tile.price)}`,
              onClick: () => void send({ type: 'buy' }),
            },
          ]}
        />
      </div>
      <p
        className="label shrink-0 text-center text-[2.1cqw] leading-tight text-white"
        data-testid="bk-buy-note"
      >
        {!canBuy
          ? `You need ${money(tile.price - cash)} more. Tap X to pass.`
          : state.options.auctionOnDecline
            ? 'Tap X to put it up for auction.'
            : 'Tap X to leave it.'}
      </p>
    </div>
  );
}
