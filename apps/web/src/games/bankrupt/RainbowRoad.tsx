import { bankrupt } from '@pogo/shared';
import { MiniCard } from './MiniCard';

const BANDS = ['#ff5533', '#f59a0b', '#fdcf51', '#56a786', '#3aaef7', '#935adc', '#e0529a'];

/** Rainbow Road: a rainbow sweeps over the middle, the street's cards sparkle and are sold back to the bank. */
export function RainbowRoad({
  state,
  name,
}: {
  state: bankrupt.BankruptState;
  name: (id: string) => string;
}) {
  const e = state.events.find((x) => x.k === 'rainbow');
  if (!e || e.k !== 'rainbow') return null;
  const tiles = e.tiles
    .map((id) => state.board.tiles.find((t) => t.id === id))
    .filter((t): t is bankrupt.OwnableTile => !!t && bankrupt.isOwnable(t));
  return (
    <div
      className="bk-pop relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#101628]"
      data-testid="bk-rainbow"
      role="status"
    >
      {/* the rainbow: seven bands, drawn left to right */}
      <div className="bk-rainbow-wipe absolute left-[7%] right-[7%] top-[8%] aspect-[2/1] overflow-hidden">
        {BANDS.map((c, i) => (
          <div
            key={c}
            className="absolute left-1/2 top-0 aspect-square -translate-x-1/2 rounded-full"
            style={{
              width: `${100 - i * 5.2}%`,
              top: `${i * 2.6}%`,
              border: `${2.6}cqw solid ${c}`,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
      <p className="bk-rainbow-title label absolute top-[44%] text-[5cqw] font-black uppercase leading-none text-white [text-shadow:0_0.5cqw_0_#101628]">
        Rainbow Road!
      </p>
      <div className="absolute bottom-[6%] flex w-[88%] items-end justify-around">
        {tiles.map((t, i) => {
          const pay = e.payouts.find((p) => p.tile === t.id);
          return (
            <div
              key={t.id}
              className="bk-rainbow-card flex flex-col items-center gap-[0.8cqw]"
              style={{ animationDelay: `${0.9 + i * 0.25}s` }}
            >
              <MiniCard tile={t} width={15} />
              <span className="label text-[2.1cqw] leading-none text-white">
                {pay ? `${name(pay.player)} +$${pay.amount}` : 'Free'}
              </span>
            </div>
          );
        })}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          className="bk-rainbow-spark absolute h-[1.4cqw] w-[1.4cqw] bg-[#fff4b4]"
          style={{
            left: `${12 + i * 15}%`,
            top: `${58 + ((i * 7) % 5) * 6}%`,
            animationDelay: `${1.1 + i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}
