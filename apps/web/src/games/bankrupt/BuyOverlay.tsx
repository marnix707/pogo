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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4"
      data-testid="bk-buy-overlay"
      role="dialog"
      aria-label={`Buy ${tile.name}?`}
    >
      <div className="bk-pop flex w-full max-w-sm flex-col items-center gap-3">
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
        <p className="label text-center text-[11px] text-white" data-testid="bk-buy-note">
          {!canBuy
            ? `You need ${money(tile.price - cash)} more. Tap X to pass.`
            : state.options.auctionOnDecline
              ? 'Tap X to put it up for auction.'
              : 'Tap X to leave it.'}
        </p>
        {tile.kind === 'transport' && (
          <p className="label text-center text-[10px] text-white/80" data-testid="bk-rent-ladder">
            Rent by how many of the {state.board.tiles.filter((t) => t.kind === 'transport').length}{' '}
            special spaces you own: {tile.rent.map((r) => money(r)).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
