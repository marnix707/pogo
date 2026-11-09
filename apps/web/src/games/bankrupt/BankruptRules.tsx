import type { CSSProperties, ReactNode } from 'react';
import {
  Block,
  Chip,
  Finger,
  RulesSheet,
  Stage,
  TextBlock,
  slide,
  useLoop,
} from '../../components/RulesKit';
import gavelUrl from '../../assets/sprites/bankrupt/auction/gavel.svg';
import pile from '../../assets/sprites/bankrupt/money/pile.json';
import { art, dieUrl } from './art';
import { frogUrl, jailChainsUrl } from './frog';
import { bundleUrl, bundlesFor } from './MoneyPile';

const NAVY = '#101628';
const COLOURS = {
  red: '#fd5f55',
  orange: '#fda200',
  green: '#56a786',
  blue: '#3aaef7',
  purple: '#935adc',
} as const;
const SLICE_COLOURS = ['#f7f1e4', '#fda200', '#3aaef7', '#fd5f55', '#56a786', '#935adc'];

const pixel: CSSProperties = { imageRendering: 'pixelated' };
const Frog = ({
  colour,
  style,
  size = 2.2,
}: {
  colour: string;
  style?: CSSProperties;
  size?: number;
}) => (
  <img
    src={frogUrl(colour, 'down', 'sit')}
    alt=""
    draggable={false}
    style={{ width: `${size}rem`, height: `${size}rem`, ...pixel, ...style }}
  />
);

/** A space of the board, flat: a colour band over a light card (navy outline, shadow to the bottom right). */
const Tile = ({
  colour,
  label,
  owner,
  style,
  children,
}: {
  colour: string;
  label?: string;
  owner?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) => (
  <div
    className="absolute overflow-hidden"
    style={{
      width: '2.6rem',
      height: '3.2rem',
      background: '#f7f1e4',
      border: `2px solid ${owner ?? NAVY}`,
      boxShadow: `2px 2px 0 ${NAVY}`,
      ...style,
    }}
  >
    <div style={{ height: '0.9rem', background: colour, borderBottom: `2px solid ${NAVY}` }} />
    {label && (
      <div
        className="text-center font-black leading-none"
        style={{ color: NAVY, fontSize: '0.55rem', marginTop: '0.35rem' }}
      >
        {label}
      </div>
    )}
    {children}
  </div>
);

/** 12 slices of 30 degrees, 1-6 twice round: the wheel is the die. */
function WheelSvg({ rotate, ms }: { rotate: number; ms: number }) {
  const slice = (i: number) => {
    const a0 = ((i * 30 - 15 - 90) * Math.PI) / 180;
    const a1 = ((i * 30 + 15 - 90) * Math.PI) / 180;
    const p = (a: number) => `${50 + 47 * Math.cos(a)} ${50 + 47 * Math.sin(a)}`;
    return `M50 50L${p(a0)}A47 47 0 0 1 ${p(a1)}Z`;
  };
  return (
    <svg
      viewBox="0 0 100 100"
      className="block h-full w-full"
      shapeRendering="crispEdges"
      style={{
        transform: `rotate(${rotate}deg)`,
        transition: ms ? `transform ${ms}ms cubic-bezier(0.12, 0.7, 0.2, 1)` : 'none',
      }}
    >
      <circle cx="50" cy="50" r="49" fill="#fdcf51" stroke={NAVY} strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i}>
          <path d={slice(i)} fill={SLICE_COLOURS[i % 6]} stroke={NAVY} strokeWidth="1" />
          <text
            x="50"
            y="22"
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fill={NAVY}
            transform={`rotate(${i * 30} 50 50)`}
          >
            {(i % 6) + 1}
          </text>
        </g>
      ))}
      <circle cx="50" cy="50" r="8" fill={NAVY} />
    </svg>
  );
}

/** Spin the wheel, the frog hops that many spaces. */
function SpinDemo() {
  const step = useLoop([800, 1700, 1500, 1000], 2);
  const spun = step >= 1;
  return (
    <Stage w={19} h={7} testId="rules-spin">
      <div
        className="absolute"
        style={{ left: '0.7rem', top: '0.9rem', width: '5.2rem', height: '5.2rem' }}
      >
        <WheelSvg rotate={spun ? -(3 * 30) - 1080 : 0} ms={step === 1 ? 1600 : 0} />
        <span
          aria-hidden
          className="absolute left-1/2 -top-1 block -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '0.4rem solid transparent',
            borderRight: '0.4rem solid transparent',
            borderTop: `0.7rem solid ${COLOURS.orange}`,
          }}
        />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${7 + i * 2.4}rem`,
            top: '3.6rem',
            width: '2.1rem',
            height: '2rem',
            background: i === 4 ? COLOURS.green : '#f7f1e4',
            border: `2px solid ${NAVY}`,
            boxShadow: `2px 2px 0 ${NAVY}`,
          }}
        />
      ))}
      <Frog colour="red" style={slide(7 + (step >= 2 ? 4 : 0) * 2.4 + 0.05, 2.1, 900)} />
      <Chip
        colour="#fdcf51"
        style={{
          left: '11rem',
          top: '0.7rem',
          opacity: step >= 2 ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      >
        4 spaces!
      </Chip>
    </Stage>
  );
}

/** A free space: buy it, or cancel and it goes to auction (a gavel, the bids climb). */
function BuyDemo() {
  const step = useLoop([900, 800, 400, 700, 700, 1100], 4);
  const auction = step >= 3;
  const bids = ['$250', '$280', '$310'];
  return (
    <Stage w={19} h={7.6} testId="rules-buy">
      <Tile colour={COLOURS.purple} label="PARIS" style={{ left: '0.9rem', top: '1.4rem' }}>
        <div
          className="text-center font-black leading-none"
          style={{ color: NAVY, fontSize: '0.6rem', marginTop: '0.3rem' }}
        >
          $350
        </div>
      </Tile>
      {!auction && (
        <>
          <Chip colour={COLOURS.green} style={{ left: '5rem', top: '1.5rem' }}>
            BUY
          </Chip>
          <Chip colour="#ff6b57" style={{ left: '5rem', top: '3.6rem' }}>
            CANCEL
          </Chip>
          <Finger
            x={step === 0 ? 9 : 6.5}
            y={step === 0 ? 6.5 : 4.3}
            down={step === 2}
            hidden={step >= 3}
          />
        </>
      )}
      {auction && (
        <>
          <img
            src={gavelUrl}
            alt=""
            draggable={false}
            style={{
              ...pixel,
              position: 'absolute',
              left: '5.4rem',
              top: '0.9rem',
              width: '3rem',
              transformOrigin: '50% 100%',
              transform: step === 5 ? 'rotate(-35deg)' : 'rotate(25deg)',
              transition: 'transform 0.25s ease-in',
            }}
          />
          {bids.map((b, i) => (
            <Chip
              key={b}
              colour={[COLOURS.blue, COLOURS.orange, COLOURS.green][i]!}
              style={{
                left: `${10 + i * 2.6}rem`,
                top: `${4.3 - i * 1.2}rem`,
                opacity: step >= 3 + i ? 1 : 0,
                transition: 'opacity 0.25s',
              }}
            >
              {b}
            </Chip>
          ))}
          <Chip
            colour="#fdcf51"
            style={{
              left: '12rem',
              top: '5.9rem',
              opacity: step === 5 ? 1 : 0,
              transition: 'opacity 0.2s',
            }}
          >
            SOLD!
          </Chip>
        </>
      )}
    </Stage>
  );
}

/** Landing on somebody's space: the rent flies to its owner. */
function RentDemo() {
  const step = useLoop([900, 800, 1300, 1100], 3);
  return (
    <Stage w={19} h={7} testId="rules-rent">
      <Tile colour="#f7f1e4" label="START" style={{ left: '0.8rem', top: '1.4rem' }} />
      <Tile
        colour={COLOURS.orange}
        label="TOKYO"
        owner={COLOURS.blue}
        style={{ left: '6.4rem', top: '1.4rem' }}
      />
      <Frog
        colour="blue"
        size={1.5}
        style={{ position: 'absolute', left: '9.1rem', top: '1.1rem' }}
      />
      <Frog colour="red" style={slide(step >= 1 ? 6.8 : 1, 3.7, 700)} />
      <Chip colour={COLOURS.red} style={{ left: '11.5rem', top: '0.6rem' }}>
        {step >= 3 ? '$930' : '$1,000'}
      </Chip>
      <Chip colour={COLOURS.blue} style={{ left: '11.5rem', top: '5.2rem' }}>
        {step >= 3 ? '$1,070' : '$1,000'}
      </Chip>
      <img
        src={art('cash')}
        alt=""
        draggable={false}
        style={{
          ...pixel,
          ...slide(step === 2 ? 12.4 : 12.4, step === 2 ? 5 : 1.5, 900, {
            width: '1.6rem',
            opacity: step === 2 ? 1 : 0,
            transition: step === 2 ? 'transform 900ms ease-in, opacity 200ms' : 'none',
          }),
        }}
      />
    </Stage>
  );
}

/** A whole colour: build up to three buildings on each space. */
function BuildDemo() {
  const step = useLoop([800, 800, 800, 800, 1400], 4);
  const icons = ['build-house', 'build-shop', 'build-hotel'];
  return (
    <Stage w={19} h={7} testId="rules-build">
      {[0, 1, 2].map((i) => (
        <Tile
          key={i}
          colour={COLOURS.green}
          owner={COLOURS.red}
          style={{ left: `${1 + i * 3.4}rem`, top: '2.2rem' }}
        >
          <img
            src={art(icons[Math.min(i, 2)]!)}
            alt=""
            draggable={false}
            style={{
              ...pixel,
              position: 'absolute',
              left: '50%',
              bottom: '0.2rem',
              width: '1.5rem',
              transform: `translateX(-50%) scale(${step > i ? 1 : 0})`,
              transition: 'transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1)',
            }}
          />
        </Tile>
      ))}
      <Chip colour="#fdcf51" style={{ left: '12.2rem', top: '0.8rem' }}>
        RENT
      </Chip>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${12.4 + i * 1.4}rem`,
            bottom: '0.9rem',
            width: '1rem',
            height: `${0.9 + i * 0.9}rem`,
            background: i <= step ? COLOURS.green : '#334461',
            border: `2px solid ${NAVY}`,
            transition: 'background 0.3s',
          }}
        />
      ))}
    </Stage>
  );
}

/** Jail: with Free Froggo everybody is asked for $50 bail; one no and nothing happens. */
function JailDemo() {
  const step = useLoop([900, 600, 600, 1300, 800, 600, 900, 1000], 3);
  const votes = step <= 3 ? step : step - 4;
  const bad = step === 6;
  const free = step === 3;
  return (
    <Stage w={19} h={7.4} testId="rules-jail">
      <div
        className="absolute"
        style={{ left: '1rem', top: '1.6rem', width: '3.4rem', height: '3.8rem' }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: '#1b2338',
            border: `2px solid ${NAVY}`,
            boxShadow: `2px 2px 0 ${NAVY}`,
          }}
        />
        <Frog
          colour="yellow"
          size={2.4}
          style={{
            position: 'absolute',
            left: free ? '4.2rem' : '0.4rem',
            top: '0.8rem',
            transition: 'left 0.7s ease-in-out',
            zIndex: 1,
          }}
        />
        {!free && (
          <img
            src={jailChainsUrl}
            alt=""
            draggable={false}
            style={{
              ...pixel,
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 2,
            }}
          />
        )}
      </div>
      {(['red', 'blue', 'green'] as const).map((c, i) => {
        const shown =
          (step >= 1 && step <= 3 && i < votes) || (step >= 5 && i < votes) || (bad && i === 2);
        const no = bad && i === 2;
        return (
          <div key={c} className="absolute" style={{ left: `${9 + i * 3.2}rem`, top: '2.8rem' }}>
            <Frog colour={c} />
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm px-1 text-[0.7rem] font-black leading-tight"
              style={{
                background: no ? '#ff6b57' : '#7ee08c',
                color: NAVY,
                border: `2px solid ${NAVY}`,
                opacity: shown ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              {no ? '✕' : '✓'}
            </span>
          </div>
        );
      })}
      <Chip colour="#fdcf51" style={{ left: '9rem', top: '0.7rem' }}>
        {bad ? 'one NO: stays in' : free ? 'all pay $50: free!' : 'pay $50 bail?'}
      </Chip>
    </Stage>
  );
}

/** Three sixes in a row: the fourth spin is the special wheel. */
function SpecialDemo() {
  const step = useLoop([500, 600, 600, 600, 1500, 1200], 4);
  return (
    <Stage w={19} h={6.2} testId="rules-special">
      {[0, 1, 2].map((i) => (
        <img
          key={i}
          src={dieUrl(6)}
          alt=""
          draggable={false}
          style={{
            ...pixel,
            position: 'absolute',
            left: `${1 + i * 3.2}rem`,
            top: '2rem',
            width: '2.6rem',
            opacity: step > i ? 1 : 0.15,
            transform: step === i + 1 ? 'scale(1.2)' : 'scale(1)',
            transition: 'opacity 0.25s, transform 0.25s',
          }}
        />
      ))}
      <span
        aria-hidden
        className="absolute text-lg font-black"
        style={{ left: '10.6rem', top: '2.3rem', color: '#fdcf51', opacity: step >= 3 ? 1 : 0 }}
      >
        ›
      </span>
      <div
        className="absolute"
        style={{
          left: '12rem',
          top: '0.6rem',
          width: '5rem',
          height: '5rem',
          opacity: step >= 3 ? 1 : 0.1,
          transition: 'opacity 0.3s',
        }}
      >
        <WheelSvg rotate={step >= 4 ? -540 : 0} ms={step === 4 ? 1400 : 0} />
      </div>
      <Chip
        colour="#7ee08c"
        style={{
          left: '12.4rem',
          top: '5.2rem',
          opacity: step === 5 ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      >
        +$50
      </Chip>
    </Stage>
  );
}

/** The money pile: more cash is more bundles; $2,000 reaches the Spin button. */
function PileDemo() {
  const step = useLoop([1200, 1200, 1200, 1500], 2);
  const cash = [500, 1000, 1500, 2000][step]!;
  const full = 116;
  const n = bundlesFor((cash / 2000) * full);
  const sprites = pile.sprites;
  const W = pile.width;
  return (
    <Stage w={19} h={8.2} testId="rules-pile">
      <div className="absolute inset-x-0 bottom-0" style={{ height: '100%' }}>
        {pile.bundles.slice(0, n).map(([si, x, y], k) => {
          const sp = sprites[si!]!;
          return (
            <img
              key={k}
              src={bundleUrl(sp.name)}
              alt=""
              draggable={false}
              style={{
                ...pixel,
                position: 'absolute',
                left: `${(x! / W) * 100}%`,
                bottom: `${y! * (19 / W)}rem`,
                width: `${(sp.w / W) * 100}%`,
              }}
            />
          );
        })}
      </div>
      <div
        className="absolute inset-x-0"
        style={{ bottom: `${full * (19 / W)}rem`, borderTop: '2px dashed #fda200' }}
      />
      <Chip colour="#fda200" style={{ right: '0.5rem', top: '0.4rem' }}>
        SPIN
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '0.5rem', top: '0.4rem' }}>
        ${cash.toLocaleString('en-US')}
      </Chip>
    </Stage>
  );
}

export function BankruptRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RulesSheet open={open} onClose={onClose} title="How to play Bankrupt" testId="bankrupt-rules">
      <TextBlock title="Goal">
        <p>
          Reach the net worth the host picked, or be the richest when the rounds run out. Your{' '}
          <b className="text-[#7ee08c]">green number</b> is your net worth: cash plus what your
          spaces and buildings sell for.
        </p>
      </TextBlock>

      <Block
        title="Spin to move"
        line={
          <>
            The wheel in the middle is the die: tap <b>Spin</b> and your frog hops that many spaces.
            A six lets you spin again. Passing <b>Start</b> pays your salary.
          </>
        }
      >
        <SpinDemo />
      </Block>

      <Block
        title="Buy or auction"
        line={
          <>
            A free space: <b>buy</b> it, or cancel and everybody can bid: the highest bid wins.
          </>
        }
      >
        <BuyDemo />
      </Block>

      <Block
        title="Rent"
        line={
          <>
            Land on somebody&apos;s space and you pay them rent. The more spaces of one colour an
            owner has, the more each one asks.
          </>
        }
      >
        <RentDemo />
      </Block>

      <Block
        title="Build"
        line={
          <>
            Own a <b>whole colour</b> and you can build up to three buildings on each space (house,
            shop, hotel) for much higher rent.
          </>
        }
      >
        <BuildDemo />
      </Block>

      <Block
        title="Jail and Free Froggo"
        line={
          <>
            Pay the fee, or wait three turns. With <b>Free Froggo</b> on, everybody else is asked to
            pay $50 bail: only if <b>all</b> say yes does the frog go free. One no and nothing
            happens.
          </>
        }
      >
        <JailDemo />
      </Block>

      <Block
        title="The special wheel"
        line={
          <>
            Spin three 6s in a row and the 4th spin is the <b>special wheel</b>: it also has $50 and
            JAIL on it. A luck card can give you one too.
          </>
        }
      >
        <SpecialDemo />
      </Block>

      <Block
        title="Your money"
        line={
          <>
            Your cash is the pile at the bottom: $2,000 reaches the Spin button, more piles up over
            the board. Below <b>-$500</b> you are <b>bankrupt</b> and out: tap a space to sell it or
            its buildings before that happens.
          </>
        }
      >
        <PileDemo />
      </Block>

      <TextBlock title="Also">
        <p>
          The <b>?</b> space draws a luck card. The <b>Auction</b> corner lets you auction one of
          your own spaces (you can cancel it).
        </p>
      </TextBlock>
    </RulesSheet>
  );
}
