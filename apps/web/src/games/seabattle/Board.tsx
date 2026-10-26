import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { seabattle } from '@pogo/shared';
import {
  BLAST_FRAME_MS,
  BOMB_FRAMES,
  BOMB_FRAME_MS,
  EXPLOSION_FRAMES,
  SPLASH_FRAMES,
  bombMs,
  bombUrl,
  burnUrl,
  explosionUrl,
  hitUrl,
  missUrl,
  shipUrl,
  splashUrl,
  targetUrl,
} from './art';
import { BOARD_ART_PX, boardUrl } from './art';
import { useFrame } from './useFrame';

const { BOARD } = seabattle;

/** A ship to draw: sunk ones are charred wrecks; `bad` tints a ship that cannot be put down here. */
export interface DrawnShip {
  ship: seabattle.Ship;
  sunk?: boolean;
  bad?: boolean;
  /** A ship being dragged. */
  lifted?: boolean;
  /** The ship that has just been sunk: it shakes and darkens before the wreck shows. */
  sinking?: boolean;
}

export interface ShotFxState {
  seq: number;
  x: number;
  y: number;
  hit: boolean;
}

const pixel: CSSProperties = { imageRendering: 'pixelated', maxWidth: 'none' };

/** The bomb falls, then a blast (hit) or a splash (miss), centred on the cell; 32 art px = 2 cells. */
function BombFx({ fx, cell, onDone }: { fx: ShotFxState; cell: number; onDone: () => void }) {
  const [t, setT] = useState(0);
  const total = bombMs(fx.hit);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const id = setTimeout(onDone, 200);
      return () => clearTimeout(id);
    }
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed >= total) {
        clearInterval(id);
        onDone();
      } else setT(elapsed);
    }, 30);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.seq]);
  const bombPart = BOMB_FRAMES * BOMB_FRAME_MS;
  const src =
    t < bombPart
      ? bombUrl(Math.min(BOMB_FRAMES - 1, Math.floor(t / BOMB_FRAME_MS)))
      : fx.hit
        ? explosionUrl(Math.min(EXPLOSION_FRAMES - 1, Math.floor((t - bombPart) / BLAST_FRAME_MS)))
        : splashUrl(Math.min(SPLASH_FRAMES - 1, Math.floor((t - bombPart) / BLAST_FRAME_MS)));
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-testid="sb-fx"
      className="pointer-events-none absolute z-20"
      style={{
        ...pixel,
        // Twice the size of the art's own 2 x 2 squares: the blast fills a 4 x 4 square area.
        left: fx.x * cell - cell * 1.5,
        top: fx.y * cell - cell * 1.5,
        width: cell * 4,
        height: cell * 4,
      }}
    />
  );
}

/** A ship going down: a chain of blasts along its squares and a banner over the sea. */
function SinkFx({ ship, cell }: { ship: seabattle.Ship; cell: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const id = setInterval(() => setT(performance.now() - start), 40);
    return () => clearInterval(id);
  }, []);
  const cells = seabattle.shipCells(ship);
  const name = seabattle.FLEET.find((f) => f.kind === ship.kind)?.name ?? 'Ship';
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="sb-sinking">
      {cells.map(([x, y], i) => {
        const frame = Math.floor((t - i * 70) / BLAST_FRAME_MS);
        if (frame < 0 || frame >= EXPLOSION_FRAMES) return null;
        return (
          <img
            key={`${x}-${y}`}
            src={explosionUrl(frame)}
            alt=""
            draggable={false}
            className="absolute"
            style={{
              ...pixel,
              left: x * cell - cell * 1.5,
              top: y * cell - cell * 1.5,
              width: cell * 4,
              height: cell * 4,
            }}
          />
        );
      })}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="sunk-pop flex flex-col items-center gap-1" data-testid="sb-sunk-banner">
          <span
            className="font-bold leading-none text-[#ff6a5f]"
            style={{
              fontSize: Math.max(28, cell * 1.7),
              textShadow: '0.07em 0.07em 0 #101628, 0 0 0.35em #000',
              WebkitTextStroke: '0.04em #101628',
            }}
          >
            SUNK!
          </span>
          <span className="label rounded-md border-2 border-line bg-panel px-2 py-0.5 text-xs text-ink">
            {name}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The radar that shows where the last hidden ships were: a green scope with rings, a sweeping beam,
 * and each ship blips into view when the beam passes over it.
 */
function Radar({
  cell,
  ships,
  delayMs,
  durationMs,
}: {
  cell: number;
  ships: seabattle.Ship[];
  delayMs: number;
  durationMs: number;
}) {
  const size = cell * BOARD;
  const center = size / 2;
  return (
    <div
      className="radar pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="sb-radar"
      style={{
        ['--radar-delay' as string]: `${delayMs}ms`,
        ['--radar-ms' as string]: `${durationMs}ms`,
      }}
    >
      <div className="radar-tint absolute inset-0" />
      <div
        className="radar-rings absolute inset-0"
        style={{
          backgroundImage:
            'repeating-radial-gradient(circle at center, transparent 0 ' +
            `${cell * 1.5 - 1}px, rgba(120,255,170,.35) ${cell * 1.5 - 1}px ${cell * 1.5}px)`,
        }}
      />
      <div className="absolute left-1/2 top-0 h-full w-px bg-[rgba(120,255,170,.35)]" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-[rgba(120,255,170,.35)]" />
      <div
        className="radar-sweep absolute"
        style={{ left: center - size, top: center - size, width: size * 2, height: size * 2 }}
      />
      {/* The hidden ships sit in a layer that a conic mask opens with the beam: a ship shows exactly as far as
          the arm has swept over it (the mask angle runs 0 to 360 degrees in step with the sweep). */}
      <div className="radar-reveal absolute inset-0" data-testid="sb-radar-ships">
        {ships.map((ship) => (
          <img
            key={ship.kind}
            src={shipUrl(ship.kind, ship.vertical)}
            alt=""
            draggable={false}
            data-testid={`sb-radar-ship-${ship.kind}`}
            className="absolute"
            style={{
              ...pixel,
              left: ship.x * cell,
              top: ship.y * cell,
              width: (ship.vertical ? 1 : seabattle.shipLength(ship.kind)) * cell,
              height: (ship.vertical ? seabattle.shipLength(ship.kind) : 1) * cell,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** A 10 x 10 sea. Ships, hit / miss markers, the aim reticle, the bomb and the radar all sit on it. */
export function Board({
  cell,
  ships = [],
  shots = [],
  hideShot = null,
  fx = null,
  onFxDone,
  sinking = null,
  target = null,
  radar = null,
  onCell,
  boardRef,
  children,
  testId,
  dim = false,
  overlayProps,
}: {
  cell: number;
  ships?: DrawnShip[];
  shots?: seabattle.Shot[];
  /** A shot whose marker is not shown yet (its bomb is still falling). */
  hideShot?: { x: number; y: number } | null;
  fx?: ShotFxState | null;
  onFxDone?: () => void;
  /** A ship that was just sunk on this sea: the blasts and the banner play over it. */
  sinking?: seabattle.Ship | null;
  target?: { x: number; y: number } | null;
  radar?: { ships: seabattle.Ship[]; delayMs: number; durationMs: number } | null;
  /** Makes every square a button (for aiming). */
  onCell?: (x: number, y: number) => void;
  boardRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  testId?: string;
  dim?: boolean;
  /** Pointer handlers on a transparent layer over the sea (placing ships by dragging). */
  overlayProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const animated = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flame = useFrame(100);
  const reticle = useFrame(300);
  const size = cell * BOARD;
  const line = Math.max(1, cell / 16);
  const burning = shots.filter(
    (s) => s.hit && !(hideShot && hideShot.x === s.x && hideShot.y === s.y),
  );
  return (
    <div
      ref={boardRef}
      data-testid={testId}
      className={`relative shrink-0 select-none ${dim ? 'opacity-90' : ''}`}
      style={{
        width: size,
        height: size,
        boxSizing: 'content-box',
        // The artist's animated board (waves + grid lines): 161 art px = 10 cells and the closing line.
        backgroundImage: `url(${boardUrl(animated)})`,
        backgroundSize: `${(BOARD_ART_PX * cell) / 16}px ${(BOARD_ART_PX * cell) / 16}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        paddingRight: line,
        paddingBottom: line,
        touchAction: 'none',
      }}
    >
      {ships.map(({ ship, sunk, bad, lifted, sinking: going }) => {
        const len = seabattle.shipLength(ship.kind);
        return (
          <img
            key={ship.kind}
            src={shipUrl(ship.kind, ship.vertical, !!sunk)}
            alt=""
            draggable={false}
            data-testid={`sb-ship-${ship.kind}`}
            data-sunk={!!sunk}
            className={`pointer-events-none absolute ${going ? 'ship-sinking' : ''}`}
            style={{
              ...pixel,
              left: ship.x * cell,
              top: ship.y * cell,
              width: (ship.vertical ? 1 : len) * cell,
              height: (ship.vertical ? len : 1) * cell,
              zIndex: lifted ? 5 : 1,
              filter: bad
                ? 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(.9)'
                : lifted
                  ? 'drop-shadow(0 4px 0 rgba(0,0,0,.45))'
                  : undefined,
              transform: lifted ? 'translateY(-3px)' : undefined,
            }}
          />
        );
      })}
      {shots
        .filter((s) => !(hideShot && hideShot.x === s.x && hideShot.y === s.y))
        .map((s) => (
          <img
            key={`${s.x}-${s.y}`}
            src={s.hit ? hitUrl() : missUrl()}
            alt=""
            draggable={false}
            data-testid={`sb-${s.hit ? 'hit' : 'miss'}-${s.x}-${s.y}`}
            className="pointer-events-none absolute z-[3]"
            style={{ ...pixel, left: s.x * cell, top: s.y * cell, width: cell, height: cell }}
          />
        ))}
      {burning.map((s) => (
        <img
          key={`burn-${s.x}-${s.y}`}
          src={burnUrl(flame + s.x * 3 + s.y)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute z-[4]"
          // The flames are twice as big as the square, centred on it.
          style={{
            ...pixel,
            left: s.x * cell - cell / 2,
            top: s.y * cell - cell / 2,
            width: cell * 2,
            height: cell * 2,
          }}
        />
      ))}
      {target && (
        <img
          src={targetUrl(reticle)}
          alt=""
          draggable={false}
          data-testid="sb-target"
          className="pointer-events-none absolute z-[6]"
          style={{
            ...pixel,
            left: target.x * cell,
            top: target.y * cell,
            width: cell,
            height: cell,
          }}
        />
      )}
      {sinking && <SinkFx ship={sinking} cell={cell} />}
      {fx && <BombFx fx={fx} cell={cell} onDone={() => onFxDone?.()} />}
      {radar && <Radar cell={cell} {...radar} />}
      {onCell &&
        Array.from({ length: BOARD * BOARD }, (_, i) => {
          const x = i % BOARD;
          const y = Math.floor(i / BOARD);
          return (
            <button
              key={i}
              type="button"
              aria-label={`Square ${String.fromCharCode(65 + x)}${y + 1}`}
              data-testid={`sb-cell-${x}-${y}`}
              className="absolute z-[7] cursor-crosshair"
              style={{ left: x * cell, top: y * cell, width: cell, height: cell }}
              onClick={() => onCell(x, y)}
            />
          );
        })}
      {overlayProps && (
        <div
          {...overlayProps}
          data-testid="sb-place-layer"
          className={`absolute inset-0 z-[8] cursor-grab ${overlayProps.className ?? ''}`}
          style={{ touchAction: 'none' }}
        />
      )}
      {children}
    </div>
  );
}
