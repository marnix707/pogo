import { useState } from 'react';
import { bankrupt } from '@pogo/shared';
import type { LobbyOptionsProps } from '../types';
import { money } from './Board';

const { TARGETS, TURN_LIMITS } = bankrupt;

/** Waiting-room panel: the net worth to win and the number of rounds (host picks, everybody sees). */
export function BankruptOptionsPicker({ room, isHost, setOptions }: LobbyOptionsProps) {
  const options = (room.options ?? {}) as Partial<bankrupt.BankruptOptions>;
  const target = options.target ?? 5000;
  const turns = options.turns ?? 0;
  const auctionOnDecline = options.auctionOnDecline ?? true;
  const [tip, setTip] = useState(false);
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
      {/* The switch; what it does is a tooltip (tap the i). */}
      <div className="relative flex min-h-12 items-center justify-between gap-3 font-semibold">
        <span className="flex items-center gap-2">
          Auction unbought spaces
          <button
            type="button"
            aria-label="What does this do?"
            aria-expanded={tip}
            data-testid="bk-auction-info"
            onClick={() => setTip((t) => !t)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-edge/50 text-xs font-bold text-neon"
          >
            i
          </button>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={auctionOnDecline}
          aria-label="Auction unbought spaces"
          data-testid="bk-auction-switch"
          disabled={!isHost}
          onClick={() => setOptions({ target, turns, auctionOnDecline: !auctionOnDecline })}
          className="shrink-0 disabled:opacity-50"
        >
          <span
            className={`relative block h-8 w-14 rounded-md border-2 transition ${
              auctionOnDecline ? 'border-neon bg-neon/25' : 'border-edge/40 bg-panel2'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-[4px] transition-all ${
                auctionOnDecline ? 'left-[1.625rem] bg-neon' : 'left-0.5 bg-muted/60'
              }`}
            />
          </span>
        </button>
        {tip && (
          <div
            role="status"
            data-testid="bk-auction-tip"
            className="info-bubble absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw]"
          >
            <span
              aria-hidden
              className="absolute -top-[7px] left-24 h-3 w-3 rotate-45 border-l-2 border-t-2 border-edge/40 bg-panel2"
            />
            <div className="relative rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-left text-sm font-normal text-ink shadow-lg">
              When somebody does not buy the space they land on, everybody can bid for it. It opens
              at 70 % of the price and is skipped when nobody else can afford that.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
