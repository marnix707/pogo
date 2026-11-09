import { yatzy } from '@pogo/shared';
import {
  Block,
  Chip,
  Finger,
  RulesSheet,
  Stage,
  TextBlock,
  useLoop,
} from '../../components/RulesKit';
import { DIE_COLOR, DIE_URL } from './Die';

const pixel = { imageRendering: 'pixelated' as const };
const D = 2.6; // rem: a die in the demos

/** One die at slot i (0-4) of a row; held ones are lifted with a gold frame. */
function DieAt({
  face,
  i,
  held = false,
  x0 = 1.2,
  y = 2.6,
  shake = false,
}: {
  face: number;
  i: number;
  held?: boolean;
  x0?: number;
  y?: number;
  shake?: boolean;
}) {
  return (
    <span
      className="absolute block"
      style={{
        left: `${x0 + i * (D + 0.5)}rem`,
        top: `${y - (held ? 0.5 : 0)}rem`,
        width: `${D}rem`,
        height: `${D}rem`,
        transition: 'top 0.25s ease',
        transform: shake ? `rotate(${i % 2 ? 8 : -8}deg)` : 'none',
        outline: held ? '2px solid #fdcf51' : 'none',
        outlineOffset: '2px',
        borderRadius: '2px',
      }}
    >
      <img
        src={DIE_URL(face)}
        alt=""
        draggable={false}
        style={{ ...pixel, width: '100%', height: '100%', display: 'block' }}
      />
    </span>
  );
}

/** Roll, hold the dice you like, roll the rest again (up to three rolls). */
function RollDemo() {
  const step = useLoop([700, 700, 900, 700, 900, 1300], 5);
  const faces = [
    [3, 6, 1, 6, 2], // first roll
    [3, 6, 1, 6, 2],
    [3, 6, 1, 6, 2],
    [5, 6, 4, 6, 1], // the others flick
    [6, 6, 6, 6, 3], // second roll
    [6, 6, 6, 6, 3],
  ][step]!;
  const held = step >= 2 ? [false, true, false, true, false] : [false, false, false, false, false];
  const heldFinal = step >= 4 ? [true, true, true, true, false] : held;
  return (
    <Stage w={19} h={7.4} testId="rules-roll">
      {faces.map((f, i) => (
        <DieAt key={i} face={f} i={i} held={heldFinal[i]} shake={step === 3 && !heldFinal[i]} />
      ))}
      <Chip colour="#fdcf51" style={{ left: '0.8rem', top: '0.5rem' }}>
        roll {step <= 2 ? '1' : '2'} of 3
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '8rem', top: '0.5rem', opacity: step >= 2 ? 1 : 0 }}>
        tap a die to hold it
      </Chip>
      <Chip
        colour="#fdcf51"
        style={{ left: '0.8rem', top: '6rem', opacity: step >= 2 && step < 4 ? 1 : 0 }}
      >
        ROLL the others
      </Chip>
      <Finger
        x={step === 2 ? 1.2 + 1 * (D + 0.5) + D / 2 : step === 3 ? 5 : 1.2 + 2 * (D + 0.5) + D / 2}
        y={step === 3 ? 6.4 : 3.4}
        down={step === 2 || step === 3}
        hidden={step === 0 || step === 1 || step >= 5}
      />
    </Stage>
  );
}

/** Pick a box for the dice: they score there, once. */
function ScoreDemo() {
  const step = useLoop([900, 900, 900, 1500], 3);
  const rows: { name: string; hint: string; value: number | null; hot?: boolean }[] = [
    { name: 'Sixes', hint: '', value: null },
    { name: 'Full house', hint: '25', value: null, hot: true },
    { name: 'Chance', hint: '', value: null },
  ];
  return (
    <Stage w={19} h={10} testId="rules-score">
      {[6, 6, 6, 2, 2].map((f, i) => (
        <DieAt key={i} face={f} i={i} x0={0.8} y={0.8} />
      ))}
      <div className="absolute" style={{ left: '0.8rem', top: '4rem', width: '16.6rem' }}>
        {rows.map((r) => {
          const hot = r.hot && step >= 1;
          return (
            <div
              key={r.name}
              className="mb-1 flex items-center justify-between rounded-sm px-2 py-1 text-[0.7rem] font-bold leading-none"
              style={{
                background: hot ? '#2a3552' : '#1b2338',
                color: '#f7f1e4',
                border: `2px solid ${hot ? '#fdcf51' : '#334461'}`,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <span>
                {r.name}
                {r.hint && <span className="ml-1 opacity-60">{r.hint}</span>}
              </span>
              <span
                style={{
                  color: '#7ee08c',
                  opacity: r.hot && step >= 2 ? 1 : 0,
                  transition: 'opacity 0.3s',
                }}
              >
                {yatzy.FULL_HOUSE_SCORE}
              </span>
            </div>
          );
        })}
      </div>
      <Finger x={14} y={step === 0 ? 4.6 : 6.0} down={step === 2} hidden={step === 3 && false} />
    </Stage>
  );
}

/** The upper section: 63 points or more earns a bonus of 35. */
function BonusDemo() {
  const step = useLoop([700, 700, 700, 700, 1500], 4);
  const pts = [0, 21, 42, 63, 63][step]!;
  return (
    <Stage w={19} h={5.2} testId="rules-bonus">
      <div
        className="absolute"
        style={{
          left: '1rem',
          top: '1.6rem',
          width: '12rem',
          height: '1.2rem',
          border: '2px solid #f7f1e4',
          background: '#101628',
        }}
      >
        <div
          style={{
            width: `${(pts / 63) * 100}%`,
            height: '100%',
            background: pts >= 63 ? '#7ee08c' : '#fdcf51',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <Chip colour="#f7f1e4" style={{ left: '1rem', top: '0.4rem' }}>
        upper section: {pts} / 63
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '13.6rem', top: '1.4rem', opacity: step >= 4 ? 1 : 0 }}>
        +{yatzy.UPPER_BONUS} bonus!
      </Chip>
    </Stage>
  );
}

/** Five of a kind: Yatzy. */
function YatzyDemo() {
  const step = useLoop([800, 900, 1400], 2);
  return (
    <Stage w={19} h={7.8} testId="rules-yatzy">
      {[5, 5, 5, 5, 5].map((f, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: `${1.2 + i * (D + 0.5)}rem`,
            top: step >= 1 ? '1.9rem' : '2.6rem',
            width: `${D}rem`,
            height: `${D}rem`,
            transition: 'top 0.25s ease',
            filter: step >= 2 ? `drop-shadow(0 0 0.35rem ${DIE_COLOR[f]})` : 'none',
          }}
        >
          <img src={DIE_URL(f)} alt="" draggable={false} style={{ ...pixel, width: '100%' }} />
        </span>
      ))}
      <Chip colour="#fdcf51" style={{ left: '1.2rem', top: '0.4rem' }}>
        five of a kind
      </Chip>
      <Chip colour="#ff6b57" style={{ left: '11rem', top: '0.4rem', opacity: step >= 2 ? 1 : 0 }}>
        YATZY! {yatzy.YATZY_SCORE}
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '1.2rem', top: '6.4rem' }}>
        another one: +{yatzy.YATZY_BONUS}
      </Chip>
    </Stage>
  );
}

export function YatzyRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RulesSheet open={open} onClose={onClose} title="How to play Yatzy" testId="yatzy-rules">
      <TextBlock title="Goal">
        <p>
          Fill all {yatzy.ROUNDS} boxes of your scorecard, one per round, and finish with the
          highest total.
        </p>
      </TextBlock>

      <Block
        title="Roll and hold"
        line={
          <>
            Each turn you roll five dice, up to <b>three times</b>. Tap the dice you want to keep
            (they lift up), then roll the rest again.
          </>
        }
      >
        <RollDemo />
      </Block>

      <Block
        title="Pick a box"
        line={
          <>
            After your last roll (or sooner) pick a box for the dice. Each box scores once: the ones
            to sixes add up that number, the others need a pattern (three or four of a kind, full
            house {yatzy.FULL_HOUSE_SCORE}, small straight {yatzy.SMALL_STRAIGHT_SCORE}, large
            straight {yatzy.LARGE_STRAIGHT_SCORE}), and Chance takes the sum of anything. A box that
            does not fit scores 0.
          </>
        }
      >
        <ScoreDemo />
      </Block>

      <Block
        title="Bonus"
        line={
          <>
            Reach <b>{yatzy.UPPER_BONUS_THRESHOLD}</b> points in the upper section (ones to sixes)
            and you earn <b>+{yatzy.UPPER_BONUS}</b>.
          </>
        }
      >
        <BonusDemo />
      </Block>

      <Block
        title="Yatzy!"
        line={
          <>
            Five of a kind is a <b>Yatzy</b>: {yatzy.YATZY_SCORE} points. Roll another one after
            that box holds {yatzy.YATZY_SCORE} and you get <b>+{yatzy.YATZY_BONUS}</b>; it then also
            counts as a Joker for another box.
          </>
        }
      >
        <YatzyDemo />
      </Block>

      <TextBlock title="Turn based or live">
        <p>
          In <b>turn based</b> games the players take turns. In <b>live</b> games everybody plays at
          the same time with their own dice and there is no turn timer: the totals are compared when
          the last card is full.
        </p>
      </TextBlock>
    </RulesSheet>
  );
}
