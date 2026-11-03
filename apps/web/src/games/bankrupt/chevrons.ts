/**
 * The upgrade emblem: one pixel chevron (^, 3 wide, 2 tall) per upgrade, stacked tight on top of each other like
 * rank insignia (level 3 = three of them). Returns an SVG path in art px with the first chevron's top-left at (x, y).
 */
export function chevronsPath(levels: number, x: number, y: number): string {
  let d = '';
  for (let i = 0; i < levels; i++) {
    const top = y + i * 2;
    d += `M${x + 1} ${top}h1v1h-1zM${x} ${top + 1}h1v1h-1zM${x + 2} ${top + 1}h1v1h-1z`;
  }
  return d;
}

/** Where the emblem starts on an owned tile (inside the rent box, left of the rent): vertically centred. */
export const tileChevronsAt = (levels: number) => ({ x: 5, y: 5 - levels });
