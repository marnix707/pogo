import { useState } from 'react';
import { bankrupt } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';
import { InfoButton } from '../../components/ui';
import { money } from './Board';

const { TARGETS, TURN_LIMITS } = bankrupt;

/** Waiting-room panel: the net worth to win and the number of rounds (host picks, everybody sees). */
export function BankruptOptionsPicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as Partial<bankrupt.BankruptOptions>;
  const target = options.target ?? 5000;
  const turns = options.turns ?? 0;
  const auctionOnDecline = options.auctionOnDecline ?? true;
  const rainbowRoad = options.rainbowRoad ?? false;
  const set = (patch: Partial<bankrupt.BankruptOptions>) =>
    setOptions({ target, turns, auctionOnDecline, rainbowRoad, ...patch });
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
              onClick={() => set({ target: t })}
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
              onClick={() => set({ turns: t })}
              className={chip(turns === t)}
            >
              {t === 0 ? 'No limit' : t}
            </button>
          ))}
        </div>
      </div>
      <Toggle
        label="Auction unbought spaces"
        id="auction"
        on={auctionOnDecline}
        isHost={isHost}
        onChange={() => set({ auctionOnDecline: !auctionOnDecline })}
        tip="When somebody does not buy the space they land on, everybody can bid for it. It opens at 70 % of the price and is skipped when nobody else can afford that."
      />
      <Toggle
        label="Rainbow Road"
        id="rainbow"
        on={rainbowRoad}
        isHost={isHost}
        onChange={() => set({ rainbowRoad: !rainbowRoad })}
        tip="With 3 or more players: when two other players each own one space of a three-space street and you land on the free third, you can pick Rainbow Road instead of buying. The street is sold back to the bank and its owners get the sell price."
      />
    </div>
  );
}

/** A switch with a tooltip (tap the i). */
function Toggle({
  label,
  id,
  on,
  isHost,
  onChange,
  tip,
}: {
  label: string;
  id: string;
  on: boolean;
  isHost: boolean;
  onChange: () => void;
  tip: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex min-h-12 items-center justify-between gap-3 font-semibold">
      <span className="flex items-center gap-2">
        {label}
        <InfoButton expanded={open} onClick={() => setOpen((t) => !t)} testId={`bk-${id}-info`} />
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid={`bk-${id}-switch`}
        disabled={!isHost}
        onClick={onChange}
        className="shrink-0 disabled:opacity-50"
      >
        <span
          className={`relative block h-8 w-14 rounded-md border-2 transition ${
            on ? 'border-neon bg-neon/25' : 'border-edge/40 bg-panel2'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-[4px] transition-all ${
              on ? 'left-[1.625rem] bg-neon' : 'left-0.5 bg-muted/60'
            }`}
          />
        </span>
      </button>
      {open && (
        <div
          role="status"
          data-testid={`bk-${id}-tip`}
          className="info-bubble absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw]"
        >
          <span
            aria-hidden
            className="absolute -top-[7px] left-24 h-3 w-3 rotate-45 border-l-2 border-t-2 border-edge/40 bg-panel2"
          />
          <div className="relative rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-left text-sm font-normal text-ink shadow-lg">
            {tip}
          </div>
        </div>
      )}
    </div>
  );
}
