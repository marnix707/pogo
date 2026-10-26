import { useRef, useState } from 'react';
import { seabattle } from '@pogo/shared';
import { Board } from './Board';
import type { DrawnShip } from './Board';

const { BOARD } = seabattle;

/** A Rng backed by Math.random: placement happens on the device, the server only checks the result. */
export const deviceRng = { int: (n: number) => Math.floor(Math.random() * n) };

interface Drag {
  kind: seabattle.ShipKind;
  /** Where inside the ship the finger grabbed it (in squares). */
  grabX: number;
  grabY: number;
  from: seabattle.Ship;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Your own sea while placing: drag a ship to a new spot, tap it to turn it. A ship that would overlap
 * another is shown in red and jumps back when you let go.
 */
export function PlacementBoard({
  cell,
  fleet,
  onChange,
  locked,
}: {
  cell: number;
  fleet: seabattle.Ship[];
  onChange: (fleet: seabattle.Ship[]) => void;
  locked: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [bad, setBad] = useState<seabattle.ShipKind | null>(null);
  // While dragging the ship moves only here (a cheap local render); the game screen hears about it on drop.
  const [live, setLive] = useState<seabattle.Ship | null>(null);
  const liveRef = useRef<seabattle.Ship | null>(null);
  const shown = live ? fleet.map((s) => (s.kind === live.kind ? live : s)) : fleet;
  const [shake, setShake] = useState(false);

  const cellAt = (e: React.PointerEvent): [number, number] => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);
    return [Math.max(0, Math.min(BOARD - 1, x)), Math.max(0, Math.min(BOARD - 1, y))];
  };

  const clampShip = (ship: seabattle.Ship): seabattle.Ship => {
    const len = seabattle.shipLength(ship.kind);
    return {
      ...ship,
      x: Math.max(0, Math.min(ship.vertical ? BOARD - 1 : BOARD - len, ship.x)),
      y: Math.max(0, Math.min(ship.vertical ? BOARD - len : BOARD - 1, ship.y)),
    };
  };

  const replace = (ship: seabattle.Ship) => fleet.map((s) => (s.kind === ship.kind ? ship : s));

  const onDown = (e: React.PointerEvent) => {
    if (locked) return;
    const [cx, cy] = cellAt(e);
    const ship = fleet.find((s) => seabattle.shipCells(s).some(([x, y]) => x === cx && y === cy));
    if (!ship) return;
    // Capture on the layer that owns these handlers, or the moves and the release never reach them.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      kind: ship.kind,
      grabX: cx - ship.x,
      grabY: cy - ship.y,
      from: ship,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const far = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6;
    const moved = drag.moved || far;
    if (!moved) return;
    const [cx, cy] = cellAt(e);
    const next = clampShip({ ...drag.from, x: cx - drag.grabX, y: cy - drag.grabY });
    if (!drag.moved) setDrag({ ...drag, moved });
    const prev = liveRef.current;
    if (prev && prev.x === next.x && prev.y === next.y) return; // still on the same square: nothing to redraw
    liveRef.current = next;
    setLive(next);
    setBad(seabattle.overlaps(next, fleet) ? drag.kind : null);
  };

  const onUp = () => {
    if (!drag) return;
    const current = liveRef.current ?? drag.from;
    liveRef.current = null;
    setLive(null);
    if (drag.moved) {
      // Dropped on top of another ship: back to where it came from.
      if (!seabattle.overlaps(current, fleet)) onChange(replace(current));
    } else {
      // A tap turns the ship around its middle, if it still fits (else around its first square).
      const len = seabattle.shipLength(drag.from.kind);
      const half = Math.floor((len - 1) / 2);
      const around = drag.from.vertical
        ? { ...drag.from, vertical: false, x: drag.from.x - half, y: drag.from.y + half }
        : { ...drag.from, vertical: true, x: drag.from.x + half, y: drag.from.y - half };
      const options = [
        clampShip(around),
        clampShip({ ...drag.from, vertical: !drag.from.vertical }),
      ];
      const turned = options.find((o) => !seabattle.overlaps(o, fleet));
      if (turned) onChange(replace(turned));
      else {
        setShake(true);
        setTimeout(() => setShake(false), 300);
      }
    }
    setDrag(null);
    setBad(null);
  };

  const drawn: DrawnShip[] = shown.map((ship) => ({
    ship,
    lifted: drag?.kind === ship.kind && drag.moved,
    bad: bad === ship.kind,
  }));

  return (
    <Board
      cell={cell}
      ships={drawn}
      boardRef={ref}
      testId="sb-place-board"
      still
      dim={locked}
      overlayProps={{
        onPointerDown: onDown,
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onUp,
        className: shake ? 'animate-pulse' : '',
      }}
    />
  );
}
