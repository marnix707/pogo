import { bankrupt } from '@pogo/shared';
import { Button, Sheet } from '../../components/ui';
import { money } from './Board';
import { PropertyCard } from './PropertyCard';
import { ICON_OF_TILE, art } from './art';

/**
 * Tap a space: a property / special space shows its card (the owner can SELL or UPGRADE there), a corner
 * shows what it does.
 */
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
  const cash = state.players.find((p) => p.id === me)?.cash ?? 0;

  if (tile && bankrupt.isOwnable(tile)) {
    const level = holding?.level ?? 0;
    const rent = holding ? bankrupt.rentOf(state, tile) : tile.rent[0]!;
    const sellFor =
      tile.sell + (tile.kind === 'property' ? level * bankrupt.buildingRefund(tile) : 0);
    const canUpgrade =
      mine &&
      canAct &&
      tile.kind === 'property' &&
      level < 3 &&
      bankrupt.ownsSet(state, me, tile) &&
      cash >= tile.buildCost;
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4"
        data-testid="bk-tile-sheet"
        role="dialog"
        aria-label={tile.name}
        onClick={onClose}
      >
        <div
          className="bk-pop flex w-full max-w-sm flex-col items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <PropertyCard
            tile={tile}
            level={level}
            rent={rent}
            onClose={onClose}
            actions={[
              {
                kind: 'sell',
                enabled: mine && canAct,
                testId: 'bk-sell',
                label: `Sell ${tile.name} for ${money(sellFor)}`,
                onClick: () => {
                  void send({ type: 'sellProperty', tile: tile.id });
                  onClose();
                },
              },
              {
                kind: 'upgrade',
                enabled: canUpgrade,
                testId: 'bk-build',
                label: `Upgrade ${tile.name} for ${tile.kind === 'property' ? money(tile.buildCost) : '-'}`,
                tag: tile.kind === 'property' ? tile.buildCost : undefined,
                onClick: () => void send({ type: 'build', tile: tile.id }),
              },
            ]}
          />
          <p className="label text-center text-[11px] text-white" data-testid="bk-tile-owner">
            {holding ? `Owned by ${name(holding.owner)}` : 'Not owned yet'}
            {holding && tile.kind === 'property' ? ` · buildings ${level}/3` : ''}
          </p>
          {tile.kind === 'transport' && (
            <p className="label text-center text-[10px] text-white/80">
              Rent by how many of the{' '}
              {state.board.tiles.filter((t) => t.kind === 'transport').length} special spaces you
              own: {tile.rent.map((r) => money(r)).join(' · ')}
            </p>
          )}
          {mine && canAct && (
            <div className="flex w-full gap-2">
              {tile.kind === 'property' && level > 0 && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  data-testid="bk-sell-building"
                  onClick={() => void send({ type: 'sellBuilding', tile: tile.id })}
                >
                  Sell building
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const icon = tile ? (ICON_OF_TILE[tile.id] ?? ICON_OF_TILE[tile.kind]) : undefined;
  return (
    <Sheet open={!!tile} onClose={onClose} title={tile?.name ?? 'Space'}>
      {tile && (
        <div className="flex flex-col gap-3" data-testid="bk-tile-sheet">
          {icon && (
            <img
              src={art(icon)}
              alt=""
              className="mx-auto h-20 w-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          <p className="text-center text-sm">
            {tile.kind === 'start' && `Pass or land here and collect ${money(state.board.salary)}.`}
            {tile.kind === 'jail' &&
              `Just visiting is free. In jail, pay ${money(state.board.jailFee)} or wait ${state.board.jailTurns} turns.`}
            {tile.kind === 'auction' && 'Land here to put one of your spaces up for auction.'}
            {tile.kind === 'card' && 'Land here to draw a luck card.'}
          </p>
        </div>
      )}
    </Sheet>
  );
}
