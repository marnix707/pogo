import type { CSSProperties, ReactNode } from 'react';
import { seabattle } from '@pogo/shared';
import {
  Block,
  Chip,
  Finger,
  RulesSheet,
  Stage,
  TextBlock,
  useLoop,
} from '../../components/RulesKit';
import { BOARD_ART_PX, boardUrl, hitUrl, missUrl, shipUrl, targetUrl } from './art';

type Kind = seabattle.ShipKind;
const SEA = 9.4; // rem: the sea in the demos
const CELL = (SEA / BOARD_ART_PX) * 16; // rem per square
const pixel: CSSProperties = { imageRendering: 'pixelated', maxWidth: 'none' };

/** The sea with its grid; things are placed in squares (x, y) with `at`. */
function Sea({
  children,
  left = 0.4,
  top = 0.4,
}: {
  children?: ReactNode;
  left?: number;
  top?: number;
}) {
  return (
    <div
      className="absolute"
      style={{ left: `${left}rem`, top: `${top}rem`, width: `${SEA}rem`, height: `${SEA}rem` }}
    >
      <img
        src={boardUrl(false)}
        alt=""
        draggable={false}
        style={{ ...pixel, width: '100%', height: '100%', display: 'block' }}
      />
      {children}
    </div>
  );
}
const at = (x: number, y: number, extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute',
  left: `${x * CELL}rem`,
  top: `${y * CELL}rem`,
  transition: 'left 0.6s ease-in-out, top 0.6s ease-in-out, opacity 0.25s, transform 0.25s',
  ...pixel,
  ...extra,
});
const Ship = ({
  kind,
  vertical = false,
  sunk = false,
  style,
}: {
  kind: Kind;
  vertical?: boolean;
  sunk?: boolean;
  style: CSSProperties;
}) => {
  const len = seabattle.FLEET.find((s) => s.kind === kind)?.length ?? 2;
  return (
    <img
      src={shipUrl(kind, vertical, sunk)}
      alt=""
      draggable={false}
      style={{
        ...style,
        width: `${(vertical ? 1 : len) * CELL}rem`,
        height: `${(vertical ? len : 1) * CELL}rem`,
      }}
    />
  );
};

/** Placing: drag a ship to a new spot, tap one to turn it. */
function PlaceDemo() {
  const step = useLoop([900, 1100, 600, 900, 1400], 4);
  const moved = step >= 1;
  const turned = step >= 3;
  // finger path (rem, inside the stage): on the destroyer, over to its new spot, then on the cruiser
  const f = [
    { x: 0.4 + 1.5 * CELL, y: 0.4 + 6.5 * CELL },
    { x: 0.4 + 6.5 * CELL, y: 0.4 + 6.5 * CELL },
    { x: 0.4 + 2.5 * CELL, y: 0.4 + 3.5 * CELL },
    { x: 0.4 + 2.5 * CELL, y: 0.4 + 3.5 * CELL },
    { x: 0.4 + 2.5 * CELL, y: 0.4 + 3.5 * CELL },
  ][step]!;
  return (
    <Stage w={19} h={SEA + 0.8} testId="rules-place">
      <Sea>
        <Ship kind="carrier" style={at(1, 1)} />
        <Ship kind="battleship" style={at(4, 8)} />
        <Ship kind="cruiser" vertical={turned} style={at(1, 3)} />
        <Ship kind="submarine" style={at(6, 3)} />
        <Ship kind="destroyer" style={at(moved ? 6 : 1, 6)} />
      </Sea>
      <Finger x={f.x} y={f.y} down={step === 2 || step === 3} hidden={step === 4 && false} />
      <Chip colour="#fdcf51" style={{ left: '11rem', top: '1rem' }}>
        drag to move
      </Chip>
      <Chip
        colour="#fdcf51"
        style={{ left: '11rem', top: '3.4rem', opacity: step >= 2 ? 1 : 0.35 }}
      >
        tap to turn
      </Chip>
      <Chip colour="#7ee08c" style={{ left: '11rem', top: '5.8rem' }}>
        then Play
      </Chip>
    </Stage>
  );
}

/** Shooting: a hit lets you shoot again, a miss passes the turn. */
function ShootDemo() {
  const step = useLoop([700, 500, 900, 700, 500, 1100], 5);
  const first = step <= 2;
  const cell = first ? { x: 4, y: 3 } : { x: 7, y: 6 };
  return (
    <Stage w={19} h={SEA + 0.8} testId="rules-shoot">
      <Sea>
        <Ship kind="battleship" style={at(2, 3, { opacity: step >= 2 ? 1 : 0 })} />
        <img
          src={targetUrl(0)}
          alt=""
          draggable={false}
          style={at(cell.x, cell.y, {
            width: `${CELL}rem`,
            height: `${CELL}rem`,
            opacity: step === 0 || step === 3 ? 1 : 0,
          })}
        />
        <img
          src={hitUrl()}
          alt=""
          draggable={false}
          style={at(4, 3, {
            width: `${CELL}rem`,
            height: `${CELL}rem`,
            opacity: step >= 2 ? 1 : 0,
          })}
        />
        <img
          src={missUrl()}
          alt=""
          draggable={false}
          style={at(7, 6, {
            width: `${CELL}rem`,
            height: `${CELL}rem`,
            opacity: step >= 5 ? 1 : 0,
          })}
        />
      </Sea>
      <Chip
        colour="#ff6b57"
        style={{ left: '11.4rem', top: '1.6rem', opacity: step >= 2 && step < 5 ? 1 : 0 }}
      >
        HIT: shoot again!
      </Chip>
      <Chip colour="#3aaef7" style={{ left: '11.4rem', top: '5.2rem', opacity: step >= 5 ? 1 : 0 }}>
        MISS: their turn
      </Chip>
    </Stage>
  );
}

/** Every square of a ship hit: it sinks (you are told, not which one). */
function SinkDemo() {
  const step = useLoop([800, 800, 800, 1500], 3);
  return (
    <Stage w={19} h={5} testId="rules-sink">
      <div className="absolute" style={{ left: '1rem', top: '1.2rem' }}>
        <div
          className="relative"
          style={{ width: `${3 * CELL * 1.6}rem`, height: `${CELL * 1.6}rem` }}
        >
          <img
            src={shipUrl('cruiser', false, step >= 3)}
            alt=""
            draggable={false}
            style={{
              ...pixel,
              width: '100%',
              height: '100%',
              filter: step >= 3 ? 'none' : 'none',
              transform: step === 3 ? 'translateY(0.2rem)' : 'none',
              transition: 'transform 0.3s',
            }}
          />
          {[0, 1, 2].map((i) => (
            <img
              key={i}
              src={hitUrl()}
              alt=""
              draggable={false}
              style={{
                ...pixel,
                position: 'absolute',
                left: `${i * CELL * 1.6}rem`,
                top: 0,
                width: `${CELL * 1.6}rem`,
                height: `${CELL * 1.6}rem`,
                opacity: step > i && step < 3 ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            />
          ))}
        </div>
      </div>
      <Chip colour="#ff6b57" style={{ left: '10.5rem', top: '1.6rem' }}>
        {step >= 3 ? 'SUNK!' : `${Math.min(step + 1, 3)} / 3 hit`}
      </Chip>
    </Stage>
  );
}

/** The fleet: five ships to sink to win. */
function FleetDemo() {
  const step = useLoop([700, 500, 500, 500, 500, 500, 1600], 6);
  return (
    <Stage w={19} h={5.6} testId="rules-fleet">
      {seabattle.FLEET.map((s, i) => (
        <div
          key={s.kind}
          className="absolute"
          style={{ left: `${0.8 + i * 3.4}rem`, top: '1rem', width: '3rem' }}
        >
          <img
            src={shipUrl(s.kind, false, step > i)}
            alt=""
            draggable={false}
            style={{ ...pixel, width: `${s.length * 0.6}rem`, display: 'block' }}
          />
          <div className="mt-1 text-[0.6rem] font-black leading-none" style={{ color: '#f7f1e4' }}>
            {s.length}
          </div>
        </div>
      ))}
      <Chip colour="#fdcf51" style={{ left: '6.6rem', top: '3.8rem', opacity: step >= 6 ? 1 : 0 }}>
        FLEET SUNK: YOU WIN!
      </Chip>
    </Stage>
  );
}

export function SeaBattleRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RulesSheet
      open={open}
      onClose={onClose}
      title="How to play Sea Battle"
      testId="seabattle-rules"
    >
      <TextBlock title="Goal">
        <p>Sink all five enemy ships before they sink yours. A coin toss decides who starts.</p>
      </TextBlock>

      <Block
        title="Place your fleet"
        line={
          <>
            A carrier (5 squares), battleship (4), cruiser (3), submarine (3) and destroyer (2).{' '}
            <b>Drag</b> a ship to move it, <b>tap</b> it to turn it, or press <b>Random</b>. Ships
            may touch but not overlap. Press <b>Play</b> when you are happy.
          </>
        }
      >
        <PlaceDemo />
      </Block>

      <Block
        title="Take your shot"
        line={
          <>
            Tap a square on the enemy sea. <b>A hit lets you shoot again</b>; a miss passes the
            turn.
          </>
        }
      >
        <ShootDemo />
      </Block>

      <Block
        title="Sinking"
        line={
          <>
            A ship sinks when every square of it is hit. You are told when one goes down, never
            which one is where.
          </>
        }
      >
        <SinkDemo />
      </Block>

      <Block
        title="Winning"
        line={
          <>
            Sink the whole enemy fleet first. A radar then shows where the last hidden ships were.
          </>
        }
      >
        <FleetDemo />
      </Block>
    </RulesSheet>
  );
}
