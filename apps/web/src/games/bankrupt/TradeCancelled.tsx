import type { bankrupt } from '@pogo/shared';
import { useEffect } from 'react';
import { play } from '../../lib/sound';

/** How long the "no deal" show lasts. */
export const TRADE_CANCELLED_MS = 1900;

/** The trade on the Auction corner is off (everybody passed, the mover cancelled, or nobody could trade at all). */
export function TradeCancelled({
  state,
  name,
}: {
  state: bankrupt.BankruptState;
  name: (id: string) => string;
}) {
  const e = state.events.find((x) => x.k === 'tradeNone' || x.k === 'tradeEnd');
  useEffect(() => {
    const t = setTimeout(() => play('error'), 350);
    return () => clearTimeout(t);
  }, []);
  if (!e || (e.k !== 'tradeNone' && e.k !== 'tradeEnd')) return null;
  const none = e.k === 'tradeNone';
  return (
    <div
      className="bk-pop relative flex h-full w-full flex-col items-center justify-center gap-[3cqw] overflow-hidden bg-[#101628]"
      data-testid="bk-trade-cancelled"
      role="status"
    >
      <div className="relative flex w-[60%] items-center justify-between">
        {[0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            className="bk-nodeal-slot block aspect-[19/24] w-[38%] rounded-[0.6cqw] border-[0.5cqw] border-dashed border-white/40"
          />
        ))}
        <span
          aria-hidden
          className="bk-nodeal-x absolute left-1/2 top-1/2 text-[16cqw] font-black leading-none text-[#ff6b57] [text-shadow:0_0.8cqw_0_#101628]"
        >
          ✕
        </span>
      </div>
      <p className="bk-nodeal-title label text-[5cqw] font-black uppercase leading-none text-[#ff8f73]">
        {none ? 'No trade' : 'Trade cancelled'}
      </p>
      <p className="label max-w-[90%] text-center text-[2.4cqw] leading-tight text-white/80">
        {none ? `${name(e.by)} has nobody to trade with` : `Nobody made a deal with ${name(e.by)}`}
      </p>
    </div>
  );
}
