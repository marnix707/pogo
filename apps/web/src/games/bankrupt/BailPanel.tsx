import type { bankrupt } from '@pogo/shared';
import { Button } from '../../components/ui';
import { useCountdown } from '../../lib/useCountdown';
import { money } from './Board';

type State = bankrupt.BankruptState;

/**
 * Free Froggo: a frog sits in jail and its turn has come. Every other player is asked to pay the bail; only when
 * ALL of them say yes does everybody pay and the frog goes free. The list shows who has said yes so far.
 */
export function BailPanel({
  state,
  me,
  name,
  send,
  busy,
  deadline,
  serverTime,
}: {
  state: State;
  me: string;
  name: (id: string) => string;
  send: (m: bankrupt.BankruptMove) => Promise<void>;
  busy: boolean;
  deadline: number | null;
  serverTime: number;
}) {
  const b = state.bail!;
  const left = useCountdown(deadline, serverTime);
  const mustAnswer = b.voters.includes(me) && !b.accepted.includes(me);
  const cash = state.players.find((p) => p.id === me)?.cash ?? 0;
  return (
    <div
      className="bk-pop flex h-full w-full flex-col items-center justify-between gap-[1.5cqw] bg-[#101628] p-[3cqw] text-white"
      data-testid="bk-bail"
      role="dialog"
      aria-label="Free Froggo"
    >
      <p className="label text-center text-[4.4cqw] font-black uppercase leading-none text-neon">
        Free Froggo?
        {left !== null && (
          <span
            className={`ml-[2cqw] tabular-nums ${left <= 5 ? 'text-[#ff8f73]' : 'text-white/80'}`}
            data-testid="bk-bail-timer"
          >
            {left}s
          </span>
        )}
      </p>
      <p className="label text-center text-[2.6cqw] leading-tight">
        {b.subject === me ? 'You' : name(b.subject)} {b.subject === me ? 'are' : 'is'} in jail.
        Everybody pays {money(b.amount)} to set the frog free, or nobody does.
      </p>
      <ul className="flex w-full flex-col gap-[0.8cqw]" data-testid="bk-bail-list">
        {b.voters.map((v) => {
          const yes = b.accepted.includes(v);
          return (
            <li
              key={v}
              data-testid={`bk-bail-row-${v}`}
              data-yes={yes}
              className="flex items-center justify-between rounded-[0.6cqw] bg-white/5 px-[2.5cqw] py-[0.9cqw]"
            >
              <span className="label text-[2.6cqw] leading-none">
                {name(v)}
                {v === me ? ' (you)' : ''}
              </span>
              <span
                className={`label text-[2.6cqw] leading-none ${yes ? 'text-[#74cca8]' : 'text-white/60'}`}
              >
                {yes ? `PAID ${money(b.amount)}` : 'deciding…'}
              </span>
            </li>
          );
        })}
      </ul>
      {mustAnswer ? (
        <div className="grid w-full grid-cols-2 gap-[2cqw]">
          <Button
            variant="gold"
            data-testid="bk-bail-pay"
            disabled={busy || cash < b.amount}
            onClick={() => void send({ type: 'bailPay' })}
          >
            Free froggo! {money(b.amount)}
          </Button>
          <Button
            variant="secondary"
            data-testid="bk-bail-no"
            disabled={busy}
            onClick={() => void send({ type: 'bailRefuse' })}
          >
            No
          </Button>
        </div>
      ) : (
        <p className="label text-center text-[2.4cqw] leading-none text-white/80">
          {b.subject === me ? 'Waiting for the others…' : 'Waiting for the others to answer…'}
        </p>
      )}
    </div>
  );
}
