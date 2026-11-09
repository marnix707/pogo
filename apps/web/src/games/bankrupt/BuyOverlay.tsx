import { bankrupt } from '@pogo/shared';
import { money } from './Board';
import { PropertyCard } from './PropertyCard';
import { useCloseAnim } from './useCloseAnim';

/** You stopped on a space nobody owns: its card pops up with Buy; Pass (or Auction, when passing puts it up for auction) sits left of Buy; there is no X. */
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
  const { closing, run } = useCloseAnim();
  const cash = state.players.find((p) => p.id === me)?.cash ?? 0;
  const canBuy = cash >= tile.price;
  // Rainbow Road replaces Buy when two other players each own a space of this street.
  const rainbow = bankrupt.rainbowRoad(state, me) !== null;
  const auctions = bankrupt.declineAuctions(state, me, tile);
  const note = rainbow
    ? 'Sell the whole street to the bank, or pass.'
    : !canBuy
      ? `You need ${money(tile.price - cash)} more.`
      : auctions
        ? 'Pass and it goes up for auction.'
        : 'Pass and it stays free.';
  return (
    <div
      className={`${closing ? 'bk-pop-out' : 'bk-pop'} flex h-full w-full flex-col items-center gap-[1%] bg-[#101628]/70 p-[1.5%]`}
      data-testid="bk-buy-overlay"
      role="dialog"
      aria-label={`Buy ${tile.name}?`}
    >
      <div className="min-h-0 w-full flex-1">
        <PropertyCard
          tile={tile}
          level={0}
          groupSize={tile.kind === 'property' ? bankrupt.groupOf(state.board, tile).length : 3}
          rent={tile.rent[0]!}
          closeLabel="Cancel"
          hideClose
          note={note}
          onClose={() => run(() => void send({ type: 'decline' }))}
          actions={[
            // left of Buy: Auction when passing puts the space up for auction, else just Pass
            auctions
              ? {
                  kind: 'auction',
                  enabled: !busy,
                  testId: 'bk-auction-btn',
                  label: `Pass on ${tile.name} and put it up for auction`,
                  onClick: () => run(() => void send({ type: 'decline' })),
                }
              : {
                  kind: 'pass',
                  enabled: !busy,
                  testId: 'bk-pass-btn',
                  label: `Pass on ${tile.name}`,
                  onClick: () => run(() => void send({ type: 'decline' })),
                },
            rainbow
              ? {
                  kind: 'rainbow',
                  enabled: !busy,
                  testId: 'bk-rainbow-btn',
                  label: 'Rainbow Road: sell the whole street to the bank',
                  onClick: () => run(() => void send({ type: 'rainbow' })),
                }
              : {
                  kind: 'buy',
                  enabled: canBuy && !busy,
                  testId: 'bk-buy',
                  label: `Buy ${tile.name} for ${money(tile.price)}`,
                  onClick: () => run(() => void send({ type: 'buy' })),
                },
          ]}
        />
      </div>
      <p className="sr-only" data-testid="bk-buy-note">
        {note}
      </p>
    </div>
  );
}
