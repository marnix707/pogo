import { bankrupt } from '@pogo/shared';
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
        className="bk-pop flex h-full w-full flex-col items-center gap-[1%] bg-[#101628]/70 p-[1.5%]"
        data-testid="bk-tile-sheet"
        role="dialog"
        aria-label={tile.name}
        onClick={onClose}
      >
        <div className="min-h-0 w-full flex-1" onClick={(e) => e.stopPropagation()}>
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
        </div>
        <p
          className="label shrink-0 text-center text-[2.1cqw] leading-tight text-white"
          data-testid="bk-tile-owner"
          onClick={(e) => e.stopPropagation()}
        >
          {holding ? `Owned by ${name(holding.owner)}` : 'Not owned yet'}
          {holding && tile.kind === 'property' ? ` · buildings ${level}/3` : ''}
          {mine && canAct && tile.kind === 'property' && level > 0 && (
            <button
              type="button"
              data-testid="bk-sell-building"
              className="ml-2 rounded border border-white/60 px-1.5 py-0.5"
              onClick={() => void send({ type: 'sellBuilding', tile: tile.id })}
            >
              Sell building
            </button>
          )}
        </p>
      </div>
    );
  }

  const icon = tile ? (ICON_OF_TILE[tile.id] ?? ICON_OF_TILE[tile.kind]) : undefined;
  if (!tile) return null;
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-center gap-[3%] bg-[#101628]/80 p-[3%] text-center"
      data-testid="bk-tile-sheet"
      role="dialog"
      aria-label={tile.name}
      onClick={onClose}
    >
      <p className="text-[4cqw] font-extrabold uppercase text-white">{tile.name}</p>
      {icon && (
        <img
          src={art(icon)}
          alt=""
          className="h-[20%] w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <p className="max-w-[90%] text-[2.6cqw] leading-tight text-white">
        {tile.kind === 'start' && `Pass or land here and collect ${money(state.board.salary)}.`}
        {tile.kind === 'jail' &&
          `Land here and you go to jail: pay ${money(state.board.jailFee)} to get out at once, or pass and sit out ${state.board.jailTurns} turns.`}
        {tile.kind === 'auction' && 'Land here to trade one of your spaces with the other players.'}
        {tile.kind === 'card' && 'Land here to draw a luck card.'}
      </p>
      <p className="text-[2cqw] uppercase text-white/70">Tap to close</p>
    </div>
  );
}
