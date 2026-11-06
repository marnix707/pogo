import { useEffect } from 'react';
import { bankrupt } from '@pogo/shared';
import { play } from '../../lib/sound';
import gavelUrl from '../../assets/sprites/bankrupt/auction/gavel.svg';
import blockUrl from '../../assets/sprites/bankrupt/auction/block.svg';
import { money } from './Board';
import { MiniCard } from './MiniCard';

/** How long the "sold" show lasts (the payment flies to the town hall after it). */
export const AUCTION_WON_MS = 2700;

/**
 * An auction has been won: the gavel comes down on its block (with the knock), "SOLD!", the winner's name and the
 * price, then the space's card slides over to the winner's seat. `to` is where that seat is, in % of the panel.
 */
export function AuctionWon({
  state,
  name,
  to,
}: {
  state: bankrupt.BankruptState;
  name: (id: string) => string;
  to: { dx: number; dy: number };
}) {
  const e = state.events.find((x) => x.k === 'auction' && x.winner);
  useEffect(() => {
    const t = setTimeout(() => play('hammer'), 430);
    return () => clearTimeout(t);
  }, []);
  if (!e || e.k !== 'auction' || !e.winner) return null;
  const tile = state.board.tiles.find((t) => t.id === e.tile);
  if (!tile || !bankrupt.isOwnable(tile)) return null;
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div
      className="bk-pop relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#101628]"
      data-testid="bk-auction-won"
      role="status"
    >
      {/* the gavel and its block */}
      <div className="absolute left-1/2 top-[6%] w-[30%] -translate-x-1/2">
        <img
          src={gavelUrl}
          alt=""
          className={`${reduced ? '' : 'bk-gavel'} absolute bottom-[34%] left-[22%] block w-[56%]`}
          style={{ imageRendering: 'pixelated', transformOrigin: '50% 100%' }}
        />
        <img
          src={blockUrl}
          alt=""
          className={`${reduced ? '' : 'bk-block'} relative mt-[62%] block w-full`}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <p className="bk-sold label absolute top-[30%] text-[7cqw] font-black uppercase leading-none text-[#fdcf51] [text-shadow:0_0.7cqw_0_#8a4f2a]">
        Sold!
      </p>
      <p
        className="bk-sold-line label absolute top-[43%] max-w-[90%] truncate text-center text-[3.4cqw] leading-none text-white"
        data-testid="bk-won-name"
      >
        {name(e.winner)}
      </p>
      <p className="bk-sold-line label absolute top-[50%] text-[2.6cqw] leading-none text-white/80">
        wins {tile.name} for {money(e.amount)}
      </p>
      <div
        className={`${reduced ? '' : 'bk-win-card'} absolute bottom-[8%]`}
        style={{ ['--dx' as string]: `${to.dx}cqw`, ['--dy' as string]: `${to.dy}cqw` }}
      >
        <MiniCard tile={tile} width={20} />
      </div>
    </div>
  );
}
