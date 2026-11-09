import type { CSSProperties } from 'react';
import { karma } from '@pogo/shared';
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
import { Button } from '../../components/ui';
import { frames as flameFrames } from './BurnFire';
import { cardUrlByName } from './cardArt';
import { TUTORIAL_EVENT } from './KarmaTutorial';

const W = 3; // rem: a card in the demos (5 x 7 em)
const H = (W * 7) / 5;
const pixel: CSSProperties = { imageRendering: 'pixelated' };

/** One card by its file name (`7H`, `back`), at (x, y) rem; it slides with a transition. */
function K({
  name,
  x,
  y,
  ms = 600,
  dim = false,
  scale = 1,
  opacity = 1,
  z = 0,
  flipped = false,
}: {
  name: string;
  x: number;
  y: number;
  ms?: number;
  dim?: boolean;
  scale?: number;
  opacity?: number;
  z?: number;
  flipped?: boolean;
}) {
  return (
    <img
      src={cardUrlByName(name)}
      alt=""
      draggable={false}
      style={{
        ...pixel,
        ...slide(x, y, ms, { width: `${W}rem`, height: `${H}rem`, opacity, zIndex: z }),
        transform: `translate(${x}rem, ${y}rem) scale(${scale}) ${flipped ? 'rotateY(180deg)' : ''}`,
        filter: dim ? 'brightness(0.4)' : 'none',
      }}
    />
  );
}

/** Swap cards from your hand with your face-up cards before play starts. */
function SwapDemo() {
  const step = useLoop([900, 700, 700, 1500], 3);
  const swapped = step >= 2;
  return (
    <Stage w={19} h={10.4} testId="rules-swap-cards">
      <Chip colour="#c9bfa8" style={{ left: '0.6rem', top: '0.3rem' }}>
        face up
      </Chip>
      <K name="3H" x={swapped ? 1.2 : 1.2} y={1.5} />
      <K name={swapped ? 'KS' : '5C'} x={4.8} y={1.5} />
      <K name="AS" x={8.4} y={1.5} />
      <Chip colour="#c9bfa8" style={{ left: '0.6rem', top: '6.1rem' }}>
        hand
      </Chip>
      <K name="4D" x={1.2} y={7.0} opacity={1} />
      <K name={swapped ? '5C' : 'KS'} x={4.8} y={7.0} />
      <K name="9C" x={8.4} y={7.0} />
      <Chip
        colour="#7ee08c"
        style={{ left: '12.6rem', top: '4.6rem', opacity: step === 3 ? 1 : 0 }}
      >
        then Ready
      </Chip>
      <Finger
        x={step === 0 ? 6.3 : step === 1 ? 6.3 : 6.3}
        y={step === 0 ? 9.2 : step === 1 ? 3.5 : 3.5}
        down={step === 1 || step === 2}
        hidden={step === 3}
      />
    </Stage>
  );
}

/** Play a card equal to or higher than the top of the pile. */
function PlayDemo() {
  const step = useLoop([900, 800, 800, 1300], 3);
  const played = step >= 2;
  return (
    <Stage w={19} h={8.8} testId="rules-play-cards">
      <K name="6S" x={13} y={1.4} />
      <K name="9C" x={played ? 13.3 : 5.2} y={played ? 1.1 : 3.9} z={played ? 3 : 0} ms={700} />
      <K name="4D" x={1.2} y={3.9} dim />
      <K name="KH" x={9.2} y={3.9} />
      <Chip colour="#ff6b57" style={{ left: '0.8rem', top: '1.5rem', opacity: step >= 1 ? 1 : 0 }}>
        too low
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '4.6rem', top: '1.5rem', opacity: step >= 1 ? 1 : 0 }}>
        equal or higher
      </Chip>
      <Finger
        x={step === 0 ? 17 : 6.7}
        y={step === 0 ? 6.8 : 6.2}
        down={step === 2}
        hidden={step === 3}
      />
    </Stage>
  );
}

/** Nothing playable: pick up the pile. */
function PickUpDemo() {
  const step = useLoop([900, 800, 900, 1300], 3);
  const up = step >= 2;
  const pile = [
    { n: '8H', dx: 0, r: -4 },
    { n: 'QD', dx: 0.35, r: 3 },
    { n: 'KC', dx: 0.7, r: -2 },
  ];
  return (
    <Stage w={19} h={8.8} testId="rules-pickup">
      {pile.map((c, i) => (
        <K
          key={c.n}
          name={c.n}
          x={up ? 2 + i * 1.6 : 13 + c.dx}
          y={up ? 3.8 : 1.6}
          ms={600}
          z={i}
        />
      ))}
      <K name="3D" x={13 + 0.35} y={1.2} dim opacity={up ? 0 : 0} />
      <Chip
        colour="#ff6b57"
        style={{ left: '0.8rem', top: '0.8rem', opacity: step >= 1 && !up ? 1 : 0 }}
      >
        nothing can be played
      </Chip>
      <span
        aria-hidden
        className="absolute rounded-md"
        style={{
          left: '12.6rem',
          top: '1.1rem',
          width: '4.6rem',
          height: '5.2rem',
          border: '2px dashed #fdcf51',
          opacity: step >= 1 && !up ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      />
      <Finger
        x={step === 0 ? 17 : 15}
        y={step === 0 ? 6 : 3.6}
        down={step === 2}
        hidden={step === 3}
      />
      <Chip colour="#fdcf51" style={{ left: '12.8rem', top: '7.4rem', opacity: up ? 1 : 0 }}>
        tap the pile
      </Chip>
    </Stage>
  );
}

/** 2 goes on anything, 10 burns the pile (so does four of a kind). */
function BurnDemo() {
  const step = useLoop([900, 800, 900, 1300], 3);
  const burned = step >= 2;
  return (
    <Stage w={19} h={8.8} testId="rules-burn">
      <K name="KD" x={13} y={1.6} opacity={burned ? 0 : 1} ms={400} />
      <K name="QC" x={13.4} y={1.3} opacity={burned ? 0 : 1} ms={400} />
      <K
        name="10S"
        x={step >= 1 ? 13.8 : 6}
        y={step >= 1 ? 1.0 : 3.9}
        z={3}
        opacity={burned ? 0 : 1}
        ms={600}
      />
      <K name="2H" x={1.2} y={3.9} />
      <K name="10H" x={4.6} y={3.9} />
      {flameFrames[0] && (
        <img
          src={flameFrames[(step * 2) % flameFrames.length]}
          alt=""
          draggable={false}
          style={{
            ...pixel,
            position: 'absolute',
            left: '13.3rem',
            top: '0.4rem',
            width: '3.6rem',
            opacity: step === 2 ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        />
      )}
      <Chip colour="#fdcf51" style={{ left: '1rem', top: '1.2rem' }}>
        2: on anything
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '8.4rem', top: '7.6rem', opacity: burned ? 1 : 0.5 }}>
        10: burns the pile
      </Chip>
    </Stage>
  );
}

/** After a 7 the next card must be 7 or lower. */
function SevenDemo() {
  const step = useLoop([900, 1000, 1000, 1300], 3);
  return (
    <Stage w={19} h={8.8} testId="rules-seven">
      <K name="7H" x={13.4} y={1.6} />
      <K name="5C" x={1.2} y={3.9} />
      <K name="7D" x={4.8} y={3.9} />
      <K name="9D" x={8.4} y={3.9} dim={step >= 1} />
      <Chip colour="#7ee08c" style={{ left: '1rem', top: '1.4rem', opacity: step >= 1 ? 1 : 0 }}>
        7 or lower
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '8rem', top: '2.6rem', opacity: step >= 2 ? 1 : 0 }}>
        too high
      </Chip>
    </Stage>
  );
}

/** A 3 is invisible; an 8 skips the next player. */
function ThreeEightDemo() {
  const step = useLoop([900, 900, 900, 1400], 3);
  return (
    <Stage w={19} h={9.4} testId="rules-three-eight">
      {/* 3: invisible */}
      <K name="7H" x={1.2} y={1.0} />
      <K
        name="3C"
        x={step >= 1 ? 2.0 : 1.2}
        y={step >= 1 ? 1.5 : 4.4}
        opacity={step >= 1 ? 0.75 : 1}
        z={2}
      />
      <Chip colour="#fdcf51" style={{ left: '0.7rem', top: '6.2rem' }}>
        3: invisible
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '0.7rem', top: '0.1rem', opacity: step >= 2 ? 1 : 0 }}>
        still 7 or lower
      </Chip>
      {/* 8: skip */}
      <K name="8S" x={11.2} y={1.0} />
      {['A', 'B', 'C'].map((s, i) => (
        <span
          key={s}
          className="absolute flex items-center justify-center rounded-full text-[0.65rem] font-black"
          style={{
            left: `${10.2 + i * 2.2}rem`,
            top: '5.6rem',
            width: '1.7rem',
            height: '1.7rem',
            background: i === 1 && step >= 2 ? '#5b2430' : '#233049',
            color: '#f7f1e4',
            border: `2px solid ${i === 1 && step >= 2 ? '#ff6b57' : '#334461'}`,
            transition: 'background 0.3s, border-color 0.3s',
          }}
        >
          {i === 1 && step >= 2 ? '✕' : s}
        </span>
      ))}
      <Chip colour="#fdcf51" style={{ left: '10.4rem', top: '7.3rem' }}>
        8: skips a player
      </Chip>
    </Stage>
  );
}

/** Hand and deck gone: face-up cards, then face-down cards blind. */
function TableDemo() {
  const step = useLoop([900, 800, 800, 1000, 1400], 4);
  return (
    <Stage w={19} h={8} testId="rules-table-cards">
      <K name="9H" x={1.2} y={3.2} opacity={step >= 1 ? 0 : 1} ms={400} />
      <K name="QS" x={4.8} y={3.2} opacity={step >= 2 ? 0 : 1} ms={400} />
      <K name="back" x={1.2} y={3.8} z={-1} />
      <K name="back" x={4.8} y={3.8} z={-1} />
      <K name="back" x={8.4} y={3.8} z={step >= 4 ? 1 : 0} flipped={step >= 3} />
      <img
        src={cardUrlByName('5C')}
        alt=""
        draggable={false}
        style={{
          ...pixel,
          position: 'absolute',
          left: '8.4rem',
          top: '3.8rem',
          width: `${W}rem`,
          height: `${H}rem`,
          opacity: step >= 3 ? 1 : 0,
          transition: 'opacity 0.1s 0.25s',
        }}
      />
      <K name="KD" x={13.2} y={1.6} />
      <Chip colour="#fdcf51" style={{ left: '0.8rem', top: '0.6rem' }}>
        face up first
      </Chip>
      <Chip colour="#c9bfa8" style={{ left: '8.2rem', top: '0.6rem' }}>
        then blind
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '8.4rem', top: '7.0rem', opacity: step >= 4 ? 1 : 0 }}>
        too low: pick up
      </Chip>
    </Stage>
  );
}

/** The rules of a Karma game, opened from the table. */
export function KarmaRules({
  open,
  onClose,
  rules = [],
}: {
  open: boolean;
  onClose: () => void;
  /** Extra rules in force in this game (party / epic mode). */
  rules?: string[];
}) {
  return (
    <RulesSheet open={open} onClose={onClose} title="How to play Karma" testId="karma-rules">
      <Button
        data-testid="rules-tutorial"
        variant="secondary"
        className="w-full"
        onClick={() => {
          onClose();
          window.dispatchEvent(new Event(TUTORIAL_EVENT));
        }}
      >
        Watch the tutorial
      </Button>

      {rules.length > 0 && (
        <TextBlock title="Extra rules in this game">
          <ul data-testid="rules-extra" className="flex flex-col gap-1">
            {rules.map((id) => {
              const r = karma.ruleById(id);
              return r ? (
                <li key={id}>
                  {r.emoji} <b>{r.name}</b>: {r.description}
                </li>
              ) : null;
            })}
          </ul>
        </TextBlock>
      )}

      <TextBlock title="Goal">
        <p>
          Get rid of all your cards. The last player still holding cards loses. Whoever has the
          lowest card showing (a face-up 3 counts before a 3 in hand) goes first.
        </p>
      </TextBlock>

      <Block
        title="Swap first"
        line={
          <>
            Before play starts, swap cards from your hand with your face-up cards (tap one of each)
            to build a strong table. Press <b>Ready</b> when you are happy.
          </>
        }
      >
        <SwapDemo />
      </Block>

      <Block
        title="Play"
        line={
          <>
            Tap a card to select it, tap it again to play it. Hold several of one rank? Tapping one
            selects them all: press <b>Play</b> to throw them together. The card must be equal to or
            higher than the top of the pile. After playing you draw back up to three while the deck
            lasts.
          </>
        }
      >
        <PlayDemo />
      </Block>

      <Block
        title="Pick up the pile"
        line={
          <>
            Can&apos;t play anything? Tap the <b>pile</b> to pick it up. Want to pick it up anyway?
            Tap it twice.
          </>
        }
      >
        <PickUpDemo />
      </Block>

      <Block
        title="2 and 10"
        line={
          <>
            <b>2</b> goes on anything, and anything goes on a 2. <b>10</b> can be played any time:
            it burns the whole pile and you go again. Four of a kind on top of the pile burns it
            too.
          </>
        }
      >
        <BurnDemo />
      </Block>

      <Block
        title="7"
        line={
          <>
            After a 7 the next card must be 7 or <b>lower</b> (3 to 7, so 7s can stack), or a 2, or
            a 10. Anything higher can&apos;t be played, so you pick up.
          </>
        }
      >
        <SevenDemo />
      </Block>

      <Block
        title="3 and 8"
        line={
          <>
            <b>3</b> is invisible: play it any time, the card underneath still counts. <b>8</b>{' '}
            skips the next player (with two players you simply go again); each 8 you play together
            skips one more.
          </>
        }
      >
        <ThreeEightDemo />
      </Block>

      <Block
        title="Table cards"
        line={
          <>
            Once the deck and your hand are empty, play your face-up cards. When those are gone,
            play your face-down cards blind, one at a time. If a blind card is too low, you pick up
            the pile.
          </>
        }
      >
        <TableDemo />
      </Block>
    </RulesSheet>
  );
}
