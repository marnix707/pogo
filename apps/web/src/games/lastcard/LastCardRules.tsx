import type { CSSProperties } from 'react';
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
import dirCw from '../../assets/sprites/direction/direction-cw.svg';
import dirCcw from '../../assets/sprites/direction/direction-ccw.svg';
import { cardUrlByName } from './cardArt';

const W = 3.1; // rem: a card in the demos (the art is 45 x 61)
const H = (W * 61) / 45;
const pixel: CSSProperties = { imageRendering: 'pixelated' };

/** One card of the deck by its file name, placed at (x, y) rem; it moves with a transition. */
function C({
  name,
  x,
  y,
  ms = 600,
  dim = false,
  scale = 1,
  opacity = 1,
  z = 0,
}: {
  name: string;
  x: number;
  y: number;
  ms?: number;
  dim?: boolean;
  scale?: number;
  opacity?: number;
  z?: number;
}) {
  return (
    <img
      src={cardUrlByName(name)}
      alt=""
      draggable={false}
      style={{
        ...pixel,
        ...slide(x, y, ms, { width: `${W}rem`, height: `${H}rem`, opacity, zIndex: z }),
        transform: `translate(${x}rem, ${y}rem) scale(${scale})`,
        filter: dim ? 'brightness(0.45)' : 'none',
      }}
    />
  );
}

/** Play a card of the same colour or number as the top of the pile. */
function MatchDemo() {
  const step = useLoop([900, 800, 800, 1200], 3);
  const played = step >= 2;
  return (
    <Stage w={19} h={9} testId="rules-match">
      {/* the pile */}
      <C name={played ? 'red-5' : 'blue-5'} x={14.2} y={0.7} z={1} />
      <C name="red-5" x={14.2} y={0.7} opacity={played ? 0 : 0} />
      <Chip colour="#fdcf51" style={{ left: '7.6rem', top: '0.9rem' }}>
        top card
      </Chip>
      {/* my hand: same colour, same number, no match */}
      <C name="blue-9" x={1} y={4.9} />
      <C name="red-5" x={played ? 14.2 : 5.2} y={played ? 0.7 : 4.9} z={played ? 3 : 0} ms={700} />
      <C name="green-2" x={9.4} y={4.9} dim />
      <Chip
        colour="#7ee08c"
        style={{ left: '1.6rem', top: '3.4rem', opacity: step === 1 ? 1 : 0.0 }}
      >
        colour
      </Chip>
      <Chip
        colour="#7ee08c"
        style={{ left: '5.8rem', top: '3.4rem', opacity: step === 1 ? 1 : 0.0 }}
      >
        number
      </Chip>
      <Finger
        x={step === 0 ? 17 : 6.8}
        y={step === 0 ? 8 : 7.4}
        down={step === 2}
        hidden={step >= 3}
      />
    </Stage>
  );
}

/** Nothing to play: draw one card; if it fits you may play it, otherwise Pass. */
function DrawDemo() {
  const step = useLoop([900, 700, 900, 700, 1100], 4);
  return (
    <Stage w={19} h={7.6} testId="rules-draw">
      <C name="back" x={1.2} y={1.8} />
      <C
        name="yellow-3"
        x={step >= 1 ? 7.4 : 1.2}
        y={step >= 1 ? 3.0 : 1.8}
        z={2}
        opacity={step >= 1 ? 1 : 0}
      />
      <C name="green-6" x={9.2} y={2.6} dim />
      <C name="blue-2" x={11} y={2.6} dim />
      <C name="red-5" x={15} y={1.2} />
      <Chip colour="#fdcf51" style={{ left: '0.9rem', top: '0.4rem' }}>
        DRAW
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '12.4rem', top: '6.8rem', opacity: step >= 3 ? 1 : 0 }}>
        no fit: PASS
      </Chip>
      <Finger
        x={step === 0 ? 5 : 2.8}
        y={step === 0 ? 6 : 3.6}
        down={step === 1}
        hidden={step >= 2}
      />
    </Stage>
  );
}

/** Skip, Reverse, Draw Two. */
function ActionDemo() {
  const step = useLoop([900, 1000, 1000, 1200], 3);
  const seat = (x: number, y: number, hit: boolean, label: string) => (
    <span
      className="absolute flex items-center justify-center rounded-full text-[0.65rem] font-black"
      style={{
        left: `${x}rem`,
        top: `${y}rem`,
        width: '1.7rem',
        height: '1.7rem',
        background: hit ? '#5b2430' : '#233049',
        color: '#f7f1e4',
        border: `2px solid ${hit ? '#ff6b57' : '#334461'}`,
        transition: 'background 0.3s, border-color 0.3s',
      }}
    >
      {label}
    </span>
  );
  return (
    <Stage w={19} h={8.4} testId="rules-actions">
      {/* skip */}
      <C name="red-skip" x={0.9} y={0.6} />
      {seat(1.6, 5.4, step >= 1, 'B')}
      <span
        className="absolute text-lg font-black"
        style={{
          left: '1.95rem',
          top: '5.3rem',
          color: '#ff6b57',
          opacity: step >= 1 ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      >
        ✕
      </span>
      {/* reverse */}
      <C name="green-reverse" x={7.9} y={0.6} />
      <img
        src={step >= 1 && step <= 2 ? dirCcw : dirCw}
        alt=""
        draggable={false}
        style={{ ...pixel, position: 'absolute', left: '7.9rem', top: '4.6rem', width: '3.1rem' }}
      />
      {/* draw two */}
      <C name="blue-draw2" x={14.9} y={0.6} />
      {[0, 1].map((i) => (
        <C
          key={i}
          name="back"
          x={step >= 1 ? 15.2 + i * 0.5 : 15.2 + i * 0.5}
          y={step >= 1 ? 4.6 : 3.4}
          scale={0.5}
          opacity={step >= 1 ? 1 : 0}
        />
      ))}
      {seat(15.7, 6.5, step >= 2, 'C')}
    </Stage>
  );
}

/** Wild: pick the colour. */
function WildDemo() {
  const step = useLoop([900, 900, 900, 1300], 3);
  const colours = ['#fd5f55', '#fda200', '#56a786', '#3aaef7'];
  const pick = 3;
  return (
    <Stage w={19} h={6.4} testId="rules-wild">
      <C name={step >= 3 ? 'blue-draw2' : 'wild'} x={2} y={1.2} />
      <C name="wild-draw4" x={13.4} y={1.2} />
      <Chip colour="#ff6b57" style={{ left: '12.6rem', top: '5.2rem' }}>
        next draws 4
      </Chip>
      {colours.map((c, i) => (
        <span
          key={c}
          className="absolute block rounded-full"
          style={{
            left: `${6.4 + i * 1.7}rem`,
            top: '2.2rem',
            width: '1.3rem',
            height: '1.3rem',
            background: c,
            border: `2px solid ${i === pick && step >= 2 ? '#fff' : '#101628'}`,
            opacity: step >= 1 ? 1 : 0,
            transform: i === pick && step >= 2 ? 'scale(1.3)' : 'scale(1)',
            transition: 'opacity 0.3s, transform 0.25s',
          }}
        />
      ))}
      <Chip colour="#fdcf51" style={{ left: '6.4rem', top: '4.2rem', opacity: step >= 1 ? 1 : 0 }}>
        you pick the colour
      </Chip>
    </Stage>
  );
}

/** Shield, ghost, skull. */
function SpecialDemo() {
  const step = useLoop([900, 900, 900, 1100], 3);
  return (
    <Stage w={19} h={8} testId="rules-special-cards">
      {[
        { name: 'shield', x: 1.4, text: 'sends a draw penalty back', on: 1 },
        { name: 'blue-ghost', x: 7.2, text: 'fewer cards than you: draw 2', on: 2 },
        { name: 'red-skull', x: 13, text: 'no red card: draw 2', on: 3 },
      ].map((c) => (
        <div key={c.name}>
          <C
            name={c.name}
            x={c.x}
            y={0.9}
            scale={step === c.on || step === 0 ? 1.12 : 1}
            dim={step !== c.on && step !== 0 && false}
          />
          <div
            className="absolute text-center text-[0.62rem] font-bold leading-tight"
            style={{
              left: `${c.x - 0.7}rem`,
              top: '5.4rem',
              width: '4.5rem',
              color: step === c.on ? '#fdcf51' : '#c9bfa8',
              transition: 'color 0.3s',
            }}
          >
            {c.text}
          </div>
        </div>
      ))}
    </Stage>
  );
}

/** Last Card!: the race. */
function CallDemo() {
  const step = useLoop([900, 800, 700, 1100, 800, 700, 1100], 3);
  const second = step >= 4;
  const press = step === 2 || step === 5;
  return (
    <Stage w={19} h={8} testId="rules-call">
      <C name="red-7" x={1.2} y={0.9} />
      <Chip colour="#f7f1e4" style={{ left: '0.6rem', top: '5.6rem' }}>
        one card left
      </Chip>
      <span
        className="absolute rounded-md px-2 py-1 text-[0.72rem] font-black uppercase"
        style={{
          left: '6.4rem',
          top: '1.6rem',
          background: '#fd5f55',
          color: '#fff',
          border: '2px solid #101628',
          boxShadow: '2px 2px 0 #101628',
          opacity: step >= 1 ? 1 : 0,
          transform: step === 1 ? 'scale(1.12)' : 'scale(1)',
          transition: 'opacity 0.3s, transform 0.3s',
        }}
      >
        Last Card!
      </span>
      <Finger
        x={second ? 15.8 : 9.4}
        y={second ? 5.4 : 4.4}
        down={press}
        hidden={step === 0 || step === 3 || step === 6 || (step === 4 && false)}
      />
      <Chip colour="#7ee08c" style={{ left: '6.4rem', top: '5.8rem', opacity: step === 3 ? 1 : 0 }}>
        first: you are safe!
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '6.4rem', top: '5.8rem', opacity: step === 6 ? 1 : 0 }}>
        Call out! +4 cards
      </Chip>
    </Stage>
  );
}

export function LastCardRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RulesSheet open={open} onClose={onClose} title="How to play Last Card" testId="lastcard-rules">
      <TextBlock title="Goal">
        <p>Be the first to get rid of all your cards.</p>
      </TextBlock>

      <Block
        title="Match the top card"
        line={
          <>
            Play a card with the same <b>colour</b> or the same <b>number / symbol</b> as the top
            card.
          </>
        }
      >
        <MatchDemo />
      </Block>

      <Block
        title="Nothing to play?"
        line={
          <>
            Draw one card: if it fits you may play it, otherwise press <b>Pass</b>.
          </>
        }
      >
        <DrawDemo />
      </Block>

      <Block
        title="Action cards"
        line={
          <>
            <b>Skip</b> skips the next player. <b>Reverse</b> turns the direction around (with two
            players you play again). <b>Draw Two</b> makes the next player take two cards and lose
            their turn, unless they answer with another Draw Two or a Wild Draw Four: the penalties
            add up.
          </>
        }
      >
        <ActionDemo />
      </Block>

      <Block
        title="Wild cards"
        line={
          <>
            <b>Wild</b> plays on anything and you choose the colour. <b>Wild Draw Four</b> does that
            too and the next player takes four cards (it can be played at any time).
          </>
        }
      >
        <WildDemo />
      </Block>

      <Block
        title="Special cards"
        line={
          <>
            The <b>Shield</b> only works against a waiting draw penalty: it goes <b>back</b> to the
            player who played the last draw card. The <b>Blue Ghost</b> (on blue or another ghost)
            makes everybody with fewer cards than you draw two. The <b>Red Skull</b> (on red or
            another skull) makes everybody without a red card draw two.
          </>
        }
      >
        <SpecialDemo />
      </Block>

      <Block
        title="Last Card!"
        line={
          <>
            Down to one card? A pulsing <b>Last Card!</b> button appears for <b>everybody</b>: a
            race. Press it first and you are safe. If somebody is faster with <b>Call out!</b> you
            draw <b>four</b>. Once the next player plays, draws or passes, it is too late.
          </>
        }
      >
        <CallDemo />
      </Block>

      <TextBlock title="Going out">
        <p>
          You cannot finish with an action card or a wild: if your last card is one, draw a card
          instead. Everyone else is ranked by the points left in their hand: numbers count their
          value, action cards 20, wilds 50.
        </p>
      </TextBlock>
    </RulesSheet>
  );
}
