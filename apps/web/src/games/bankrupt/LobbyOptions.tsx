import { bankrupt } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';
import { Toggle } from '../../components/ui';
import { money } from './Board';

const { TARGETS, TURN_LIMITS } = bankrupt;

/** Waiting-room panel: the net worth to win and the number of rounds (host picks, everybody sees). */
export function BankruptOptionsPicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as Partial<bankrupt.BankruptOptions>;
  const target = options.target ?? 5000;
  const turns = options.turns ?? 0;
  const auctionOnDecline = options.auctionOnDecline ?? true;
  const chip = (active: boolean) =>
    `min-h-10 flex-1 rounded-md border-2 px-1 text-sm font-bold ${isHost ? '' : 'opacity-60'} ${
      active ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
    }`;
  return (
    <div className="flex flex-col gap-3" data-testid="bk-options">
      <div>
        <p className="label mb-1">Net worth to win</p>
        <div className="flex gap-1.5">
          {TARGETS.map((t) => (
            <button
              key={t}
              data-testid={`bk-target-${t}`}
              aria-pressed={target === t}
              disabled={!isHost}
              onClick={() => setOptions({ target: t, turns, auctionOnDecline })}
              className={chip(target === t)}
            >
              {t === 0 ? 'None' : `${money(t / 1000)}k`.replace('$', '$')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label mb-1">Rounds</p>
        <div className="flex gap-1.5">
          {TURN_LIMITS.map((t) => (
            <button
              key={t}
              data-testid={`bk-turns-${t}`}
              aria-pressed={turns === t}
              disabled={!isHost}
              onClick={() => setOptions({ target, turns: t, auctionOnDecline })}
              className={chip(turns === t)}
            >
              {t === 0 ? 'No limit' : t}
            </button>
          ))}
        </div>
      </div>
      <Toggle
        label="Auction unbought spaces"
        hint="When somebody does not buy the space they land on, everybody can bid for it."
        checked={auctionOnDecline}
        disabled={!isHost}
        onChange={(v) => setOptions({ target, turns, auctionOnDecline: v })}
      />
    </div>
  );
}
