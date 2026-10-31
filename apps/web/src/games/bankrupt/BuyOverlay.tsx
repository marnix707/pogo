import type { bankrupt } from '@pogo/shared';
import { Button } from '../../components/ui';
import { money } from './Board';
import { BUILD_ICONS, ICON_OF_TILE, art } from './art';

/** You stopped on a space nobody owns: the space with its numbers, and Buy or Cancel. */
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
  const colour = tile.kind === 'property' ? tile.color : '#3a5f8a';
  const icon = ICON_OF_TILE[tile.id] ?? ICON_OF_TILE[tile.kind];
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-5"
      data-testid="bk-buy-overlay"
      role="dialog"
      aria-label={`Buy ${tile.name}?`}
    >
      <div className="bk-pop w-full max-w-xs overflow-hidden rounded-xl border-[3px] border-[#101628] bg-[#f4f7fa] text-[#101628] shadow-[0_8px_0_0_#101628]">
        <div
          className="px-4 py-2.5 text-center text-xl font-extrabold uppercase tracking-[0.12em] text-white [text-shadow:0_2px_0_rgb(0_0_0/0.35)]"
          style={{ background: colour }}
        >
          {tile.name}
        </div>
        <div className="grid grid-cols-3 gap-1 px-3 pt-3 text-center">
          <span>
            <span className="label block text-[10px] text-[#55657f]">Price</span>
            <b className="text-xl">{money(tile.price)}</b>
          </span>
          <span>
            <span className="label block text-[10px] text-[#55657f]">Rent</span>
            <b className="text-xl">
              {tile.kind === 'utility' ? `${tile.rent[0]} x die` : money(tile.rent[0]!)}
            </b>
          </span>
          <span>
            <span className="label block text-[10px] text-[#55657f]">Sell price</span>
            <b className="text-xl">{money(tile.sell)}</b>
          </span>
        </div>
        {tile.kind === 'property' ? (
          <div className="px-3 pt-2">
            <div className="grid grid-cols-3 place-items-center gap-1 text-center">
              {BUILD_ICONS.map((b, i) => (
                <span key={b} className="flex flex-col items-center gap-1">
                  <span className="text-sm font-bold text-[#55657f]">
                    +{money(tile.rent[i + 1]!)}
                  </span>
                  <img
                    src={art(b)}
                    alt=""
                    className="h-12 w-auto"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </span>
              ))}
            </div>
            <p className="pt-1 text-center text-sm">
              Each building costs <b>{money(tile.buildCost)}</b>
            </p>
          </div>
        ) : (
          icon && (
            <img
              src={art(icon)}
              alt=""
              className="mx-auto mt-2 h-16 w-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          )
        )}
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button
            variant="gold"
            data-testid="bk-buy"
            disabled={busy || !canBuy}
            onClick={() => void send({ type: 'buy' })}
          >
            Buy {money(tile.price)}
          </Button>
          <Button
            variant="secondary"
            data-testid="bk-decline"
            disabled={busy}
            onClick={() => void send({ type: 'decline' })}
          >
            Cancel
          </Button>
        </div>
        <p className="px-3 pb-3 text-center text-xs text-[#55657f]">
          {!canBuy
            ? `You need ${money(tile.price - cash)} more.`
            : state.options.auctionOnDecline
              ? 'Cancel puts it up for auction.'
              : 'Cancel leaves it free.'}
        </p>
      </div>
    </div>
  );
}
