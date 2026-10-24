import type { Rng } from '../../game/rng';

/** The board is square. */
export const BOARD = 10;

export type ShipKind = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

/** The classic fleet: one of each, 17 cells in all. */
export const FLEET: readonly { kind: ShipKind; length: number; name: string }[] = [
  { kind: 'carrier', length: 5, name: 'Carrier' },
  { kind: 'battleship', length: 4, name: 'Battleship' },
  { kind: 'cruiser', length: 3, name: 'Cruiser' },
  { kind: 'submarine', length: 3, name: 'Submarine' },
  { kind: 'destroyer', length: 2, name: 'Destroyer' },
];
export const FLEET_CELLS = FLEET.reduce((n, s) => n + s.length, 0);

/** A ship on the board: its first cell (top-left) and whether it lies vertically. */
export interface Ship {
  kind: ShipKind;
  x: number;
  y: number;
  vertical: boolean;
}

export const shipLength = (kind: ShipKind): number =>
  FLEET.find((s) => s.kind === kind)?.length ?? 0;

export const cellIndex = (x: number, y: number): number => y * BOARD + x;

/** The cells a ship covers, as `[x, y]` pairs. */
export function shipCells(ship: Ship): [number, number][] {
  const n = shipLength(ship.kind);
  return Array.from({ length: n }, (_, i) => [
    ship.vertical ? ship.x : ship.x + i,
    ship.vertical ? ship.y + i : ship.y,
  ]);
}

const inBoard = (x: number, y: number) => x >= 0 && y >= 0 && x < BOARD && y < BOARD;

/** True when every cell of the ship is on the board. */
export const shipFits = (ship: Ship): boolean => shipCells(ship).every(([x, y]) => inBoard(x, y));

/** True when the ship lies on a cell the other ships already cover. */
export function overlaps(ship: Ship, others: readonly Ship[]): boolean {
  const taken = new Set(
    others
      .filter((o) => o.kind !== ship.kind)
      .flatMap(shipCells)
      .map(([x, y]) => cellIndex(x, y)),
  );
  return shipCells(ship).some(([x, y]) => taken.has(cellIndex(x, y)));
}

/** A complete, legal fleet: each ship once, all on the board, none on top of another (touching is fine). */
export function validFleet(ships: readonly Ship[]): boolean {
  if (ships.length !== FLEET.length) return false;
  for (const f of FLEET) if (ships.filter((s) => s.kind === f.kind).length !== 1) return false;
  if (!ships.every(shipFits)) return false;
  const seen = new Set<number>();
  for (const s of ships)
    for (const [x, y] of shipCells(s)) {
      const i = cellIndex(x, y);
      if (seen.has(i)) return false;
      seen.add(i);
    }
  return true;
}

/** A random legal fleet (the "Random" button, and the computer's placement). */
export function randomFleet(rng: Rng): Ship[] {
  for (;;) {
    const placed: Ship[] = [];
    let ok = true;
    for (const f of FLEET) {
      let ship: Ship | null = null;
      for (let tries = 0; tries < 200 && !ship; tries++) {
        const vertical = rng.int(2) === 1;
        const cand: Ship = {
          kind: f.kind,
          vertical,
          x: rng.int(vertical ? BOARD : BOARD - f.length + 1),
          y: rng.int(vertical ? BOARD - f.length + 1 : BOARD),
        };
        if (!overlaps(cand, placed)) ship = cand;
      }
      if (!ship) {
        ok = false;
        break;
      }
      placed.push(ship);
    }
    if (ok) return placed;
  }
}
