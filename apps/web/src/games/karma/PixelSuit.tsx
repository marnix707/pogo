/** The four suits as pixel art (9 x 9 grids), crisp at any size, instead of the font's smooth glyphs. */
const GRID: Record<number, string[]> = {
  // 0 spade
  0: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '#########',
    '###.#.###',
    '...###...',
    '..#####..',
  ],
  // 1 heart
  1: [
    '.##...##.',
    '####.####',
    '#########',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  // 2 diamond
  2: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  // 3 club
  3: [
    '...###...',
    '..#####..',
    '..#####..',
    '.##.#.##.',
    '#########',
    '#########',
    '.##.#.##.',
    '...###...',
    '..#####..',
  ],
};

/** One path of 1 x 1 squares for a grid (runs of pixels in a row are merged). */
export function suitPath(suit: number): string {
  const rows = GRID[suit] ?? GRID[0]!;
  let d = '';
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g))
      d += `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`;
  });
  return d;
}

export function PixelSuit({ suit, className }: { suit: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 9 9"
      width="1em"
      height="1em"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
      className={className}
    >
      <path d={suitPath(suit)} />
    </svg>
  );
}
