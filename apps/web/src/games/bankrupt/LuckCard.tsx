import { useRef } from 'react';
import { PlayerName } from '../../components/PlayerName';
import type { bankrupt } from '@pogo/shared';
import { art } from './art';
import { cityArt } from './cityArt';
import { CARD_H, CARD_W, Title, text } from './PropertyCard';
import { useArtScale } from './useArtScale';

const ICON: Record<bankrupt.CardKind, string> = {
  gain: 'card-gain',
  pay: 'card-pay',
  birthday: 'card-birthday',
  party: 'card-party',
  travel: 'card-travel',
  repair: 'card-repair',
  jail: 'icon-jail',
  wheel: 'card-gain', // (the gift icon until the artist draws a wheel one)
};
const TITLE: Record<bankrupt.CardKind, string> = {
  gain: 'LUCKY',
  pay: 'OUCH',
  birthday: 'BIRTHDAY',
  party: 'PARTY',
  travel: 'TRAVEL',
  repair: 'REPAIRS',
  jail: 'BUSTED',
  wheel: 'FORTUNE',
};
const SKY: Record<bankrupt.CardKind, string> = {
  gain: '#83e9f8',
  pay: '#fdc4c6',
  birthday: '#ae65ff',
  party: '#fdcf51',
  travel: '#74cca8',
  repair: '#d9b672',
  jail: '#9fb0c8',
  wheel: '#fdcf51',
};

/** The luck card that slides in: the kit's card with a big icon and what it says. `phase` drives the slide. */
export function LuckCard({
  kind,
  textLine,
  who,
  whoName,
  phase,
}: {
  kind: bankrupt.CardKind;
  textLine: string;
  /** The player who drew it. */
  who: string;
  whoName: string;
  phase: 'in' | 'out';
}) {
  const box = useRef<HTMLDivElement>(null);
  // Fits the middle of the board it slides over.
  const s = useArtScale(box, CARD_W, true, CARD_H);
  const title = text(TITLE[kind], CARD_W / 2, 12, 2);
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden bg-[#101628]/60 p-[1.5%]"
      data-testid="bk-luck-overlay"
      data-kind={kind}
      role="dialog"
      aria-label="Luck card"
    >
      <div
        ref={box}
        className={`flex h-full w-full items-center justify-center ${phase === 'in' ? 'bk-card-in' : 'bk-card-out'}`}
      >
        <div className="relative" style={{ width: CARD_W * s, height: CARD_H * s }}>
          <svg
            viewBox={`0 0 ${CARD_W} ${CARD_H}`}
            width={CARD_W * s}
            height={CARD_H * s}
            shapeRendering="crispEdges"
            style={{ imageRendering: 'pixelated', display: 'block' }}
          >
            <image href={cityArt('card-base')} x={0} y={0} width={CARD_W} height={CARD_H} />
            <image href={cityArt('header-special')} x={3} y={3} width={146} height={28} />
            <Title d={title} />
            <rect
              x={20}
              y={40}
              width={112}
              height={68}
              fill={SKY[kind]}
              stroke="#101628"
              strokeWidth={1}
            />
            <image href={art(ICON[kind])} x={CARD_W / 2 - 24} y={44} width={48} height={48} />
          </svg>
          <div
            className="absolute inset-x-[10%] flex flex-col items-center justify-center gap-1 text-center uppercase"
            style={{ top: `${(112 / CARD_H) * 100}%`, height: `${(70 / CARD_H) * 100}%` }}
          >
            <span
              className="font-extrabold leading-none text-[#796e9e]"
              style={{ fontSize: `${s * 7}px` }}
              data-testid="bk-luck-who"
            >
              <PlayerName name={whoName} id={who} />
            </span>
            <p
              className="font-extrabold leading-tight text-[#101628]"
              style={{ fontSize: `${s * 8}px` }}
              data-testid="bk-luck-text"
            >
              {textLine}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
