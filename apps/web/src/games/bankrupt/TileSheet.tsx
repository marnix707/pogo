import { bankrupt } from '@pogo/shared';
import { Button, Sheet } from '../../components/ui';
import { money } from './Board';
import { BUILD_ICONS, ICON_OF_TILE, art } from './art';

/** The details of a space (like the screenshot): price, rent, sell price, the buildings; the owner can build and sell here. */
export function TileSheet({
  state,
  me,
  tileId,
  canAct,
  send,
  name,
  onClose,
}: {
  state: bankrupt.BankruptState;
  me: string;
  tileId: string | null;
  canAct: boolean;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  name: (id: string) => string;
  onClose: () => void;
}) {
  const tile = tileId ? state.board.tiles.find((t) => t.id === tileId) : undefined;
  const holding = tile ? state.owned[tile.id] : undefined;
  const mine = holding?.owner === me;
  const me_ = state.players.find((p) => p.id === me);
  const ownable = tile && bankrupt.isOwnable(tile) ? tile : undefined;
  const icon = tile ? (ICON_OF_TILE[tile.id] ?? ICON_OF_TILE[tile.kind]) : undefined;
  return (
    <Sheet open={!!tile} onClose={onClose} title={tile?.name ?? 'Space'}>
      {tile && (
        <div className="flex flex-col gap-3" data-testid="bk-tile-sheet">
          {ownable ? (
            <>
              <div className="grid grid-cols-3 text-center">
                <span>
                  <span className="label block text-[10px] text-muted">Price</span>
                  <b className="text-lg">{money(ownable.price)}</b>
                </span>
                <span>
                  <span className="label block text-[10px] text-muted">Rent</span>
                  <b className="text-lg">
                    {ownable.kind === 'utility'
                      ? `${ownable.rent[0]} x dice`
                      : money(ownable.rent[0]!)}
                  </b>
                </span>
                <span>
                  <span className="label block text-[10px] text-muted">Sell price</span>
                  <b className="text-lg">{money(ownable.sell)}</b>
                </span>
              </div>
              {tile.kind === 'property' ? (
                <>
                  <div className="grid grid-cols-3 text-center text-sm text-muted">
                    {[1, 2, 3].map((l) => (
                      <span key={l} className={holding && holding.level >= l ? 'text-ink' : ''}>
                        +{money(tile.rent[l]!)}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 place-items-center">
                    {BUILD_ICONS.map((b, i) => (
                      <img
                        key={b}
                        src={art(b)}
                        alt=""
                        className={`h-12 w-auto ${holding && holding.level > i ? '' : 'opacity-40'}`}
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ))}
                  </div>
                  <p className="text-center text-sm">
                    Each building costs <b>{money(tile.buildCost)}</b>
                  </p>
                </>
              ) : (
                icon && (
                  <img
                    src={art(icon)}
                    alt=""
                    className="mx-auto h-16 w-auto"
                    style={{ imageRendering: 'pixelated' }}
                  />
                )
              )}
              <p className="text-center text-sm text-muted" data-testid="bk-tile-owner">
                {holding ? `Owned by ${name(holding.owner)}` : 'Not owned yet'}
              </p>
              {mine && canAct && me_ && (
                <div className="flex flex-col gap-2">
                  {tile.kind === 'property' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        data-testid="bk-build"
                        disabled={
                          !bankrupt.ownsSet(state, me, tile) ||
                          (holding?.level ?? 0) >= 3 ||
                          me_.cash < tile.buildCost
                        }
                        onClick={() => void send({ type: 'build', tile: tile.id })}
                      >
                        Build {money(tile.buildCost)}
                      </Button>
                      <Button
                        variant="secondary"
                        data-testid="bk-sell-building"
                        disabled={(holding?.level ?? 0) === 0}
                        onClick={() => void send({ type: 'sellBuilding', tile: tile.id })}
                      >
                        Sell building
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="danger"
                    data-testid="bk-sell"
                    onClick={() => {
                      void send({ type: 'sellProperty', tile: tile.id });
                      onClose();
                    }}
                  >
                    Sell for{' '}
                    {money(
                      ownable.sell +
                        (tile.kind === 'property'
                          ? (holding?.level ?? 0) * bankrupt.buildingRefund(tile)
                          : 0),
                    )}
                  </Button>
                  {state.auctionRight && (holding?.level ?? 0) === 0 && (
                    <Button
                      variant="secondary"
                      data-testid="bk-start-auction"
                      onClick={() => {
                        void send({ type: 'startAuction', tile: tile.id });
                        onClose();
                      }}
                    >
                      Auction it
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {icon && (
                <img
                  src={art(icon)}
                  alt=""
                  className="mx-auto h-20 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <p className="text-center text-sm">
                {tile.kind === 'start' &&
                  `Pass or land here and collect ${money(state.board.salary)}.`}
                {tile.kind === 'jail' &&
                  `Just visiting is free. In jail, pay ${money(state.board.jailFee)} or wait ${state.board.jailTurns} turns.`}
                {tile.kind === 'auction' && 'Land here to put one of your spaces up for auction.'}
                {tile.kind === 'card' && 'Land here to draw a luck card.'}
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
