import type { bankrupt } from '@pogo/shared';
import { money } from './Board';

/** Why the game ended, said before the results come: somebody went bankrupt, or somebody reached the goal. */
export function EndBanner({
  state,
  name,
}: {
  state: bankrupt.BankruptState;
  name: (id: string) => string;
}) {
  const broke = state.events.filter((e) => e.k === 'bankrupt');
  const winner = state.winner;
  const worth = winner ? state.players.find((p) => p.id === winner) : undefined;
  let title = 'GAME OVER';
  let line = winner ? `${name(winner)} wins` : '';
  let tone = 'text-neon';
  if (broke.length > 0) {
    title = 'BANKRUPT!';
    tone = 'text-[#ff6b57]';
    const out = broke.map((e) => name(e.by)).join(' and ');
    line = `${out} ran out of money. ${winner ? `${name(winner)} is the last one standing.` : ''}`;
  } else if (state.options.target > 0 && worth) {
    title = 'TARGET REACHED!';
    tone = 'text-[#7ee08c]';
    line = `${name(worth.id)} reached ${money(state.options.target)} net worth.`;
  } else if (winner) {
    title = 'LAST ROUND!';
    line = `The turns are up: ${name(winner)} has the most net worth.`;
  }
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-center gap-[3%] bg-[#101628]/80 p-[4%] text-center"
      data-testid="bk-end-banner"
      role="status"
    >
      <p className={`label text-[5cqw] font-black leading-none ${tone}`}>{title}</p>
      <p className="label text-[2.6cqw] leading-tight text-white">{line}</p>
    </div>
  );
}
