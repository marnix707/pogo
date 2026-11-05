// (From the artist's city_owned_svg kit. The glyph tables and the maths are unchanged; only the strict-null `!` and
// a missing-glyph check were added.)
// pixelText.ts — draws POGO pixel text with EXACTLY the same pixels as the art.
// Coordinates and sizes are in ART PIXELS (the same units as the board / card SVGs).
// Rules (same as the artwork):
//   * y is the TOP of a normal letter. Tall glyphs ('$') start 1 art px higher and end 1 lower.
//   * letters are separated by `gap` (1 art px). No kerning, no anti-aliasing.
//   * to centre text in a box: x = boxX + Math.floor((boxW - measure(text).width) / 2)
// Use pixelTextSVG() inside an SVG that uses art-pixel coordinates, or drawPixelText() on a canvas.

export type FontName = 'font5' | 'font4' | 'digits7';
type Font = { glyphs: Record<string, string[]>; rows: number; gap: number };
export const FONTS: Record<FontName, Font> = {
  font5: {
    glyphs: {
      A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
      B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
      C: ['XXX', 'X..', 'X..', 'X..', 'XXX'],
      D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
      E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
      F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
      G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'],
      H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
      I: ['X', 'X', 'X', 'X', 'X'],
      J: ['..X', '..X', '..X', 'X.X', 'XXX'],
      K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
      L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
      M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
      N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'],
      O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
      P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
      Q: ['XXX', 'X.X', 'X.X', 'XXX', '..X'],
      R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
      S: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
      T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
      U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
      V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
      W: ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
      X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
      Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
      Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
      $: ['.X.', 'XXX', 'X..', 'XXX', '..X', 'XXX', '.X.'],
      '?': ['XXX', '..X', '.X.', '...', '.X.'],
      ' ': ['.', '.', '.', '.', '.'],
      '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
      '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
      '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
      '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
      '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
      '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
      '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
      '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
      '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
      '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
      '-': ['...', '...', 'XXX', '...', '...'],
      // (added for the screen's labels)
      '.': ['.', '.', '.', '.', 'X'],
      ',': ['.', '.', '.', 'X', 'X'],
      '·': ['.', '.', 'X', '.', '.'],
      '!': ['X', 'X', 'X', '.', 'X'],
      ':': ['.', 'X', '.', 'X', '.'],
      '/': ['..X', '..X', '.X.', 'X..', 'X..'],
      '+': ['...', '.X.', 'XXX', '.X.', '...'],
      '%': ['X.X', '..X', '.X.', 'X..', 'X.X'],
      '(': ['.X', 'X.', 'X.', 'X.', '.X'],
      ')': ['X.', '.X', '.X', '.X', 'X.'],
      "'": ['X', 'X', '.', '.', '.'],
    },
    rows: 5,
    gap: 1,
  },
  font4: {
    glyphs: {
      A: ['XXX', 'X.X', 'XXX', 'X.X'],
      B: ['XX.', 'XXX', 'X.X', 'XXX'],
      C: ['XXX', 'X..', 'X..', 'XXX'],
      D: ['XX.', 'X.X', 'X.X', 'XX.'],
      E: ['XXX', 'XX.', 'X..', 'XXX'],
      F: ['XXX', 'X..', 'XX.', 'X..'],
      G: ['XXX', 'X..', 'X.X', 'XXX'],
      H: ['X.X', 'XXX', 'X.X', 'X.X'],
      I: ['X', 'X', 'X', 'X'],
      J: ['..X', '..X', 'X.X', 'XXX'],
      K: ['X.X', 'XX.', 'X.X', 'X.X'],
      L: ['X..', 'X..', 'X..', 'XXX'],
      M: ['X...X', 'XX.XX', 'X.X.X', 'X...X'],
      N: ['X..X', 'XX.X', 'X.XX', 'X..X'],
      O: ['XXX', 'X.X', 'X.X', 'XXX'],
      P: ['XXX', 'X.X', 'XXX', 'X..'],
      R: ['XXX', 'X.X', 'XX.', 'X.X'],
      S: ['.XX', 'X..', '..X', 'XX.'],
      T: ['XXX', '.X.', '.X.', '.X.'],
      U: ['X.X', 'X.X', 'X.X', 'XXX'],
      V: ['X.X', 'X.X', 'X.X', '.X.'],
      W: ['X...X', 'X.X.X', 'XX.XX', 'X...X'],
      Y: ['X.X', 'X.X', '.X.', '.X.'],
      Z: ['XXX', '..X', 'X..', 'XXX'],
      ' ': ['.', '.', '.', '.'],
    },
    rows: 4,
    gap: 1,
  },
  digits7: {
    glyphs: {
      '0': ['.XX.', 'X..X', 'X..X', 'X..X', 'X..X', 'X..X', '.XX.'],
      '1': ['.X..', 'XX..', '.X..', '.X..', '.X..', '.X..', 'XXX.'],
      '2': ['.XX.', 'X..X', '...X', '..X.', '.X..', 'X...', 'XXXX'],
      '3': ['XXX.', '...X', '...X', '.XX.', '...X', '...X', 'XXX.'],
      '4': ['X..X', 'X..X', 'X..X', 'XXXX', '...X', '...X', '...X'],
      '5': ['XXXX', 'X...', 'XXX.', '...X', '...X', 'X..X', '.XX.'],
      '6': ['.XX.', 'X...', 'X...', 'XXX.', 'X..X', 'X..X', '.XX.'],
      '7': ['XXXX', '...X', '..X.', '..X.', '.X..', '.X..', '.X..'],
      '8': ['.XX.', 'X..X', 'X..X', '.XX.', 'X..X', 'X..X', '.XX.'],
      '9': ['.XX.', 'X..X', 'X..X', '.XXX', '...X', '...X', '.XX.'],
      $: ['..X..', '.XXXX', 'X.X..', 'X.X..', '.XXX.', '..X.X', '..X.X', 'XXXX.', '..X..'],
    },
    rows: 7,
    gap: 1,
  },
};

export function measure(text: string, font: FontName = 'font5') {
  const f = FONTS[font];
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const g = f.glyphs[text[i]!];
    if (!g) throw new Error(`pixelText: no glyph for "${text[i]}" in ${font}`);
    w += g[0]!.length + (i ? f.gap : 0);
  }
  return { width: w, height: f.rows };
}

/** Rectangles [x, y, w, h] in art px (horizontal runs merged). */
export function pixelTextRects(
  text: string,
  x: number,
  y: number,
  font: FontName = 'font5',
): [number, number, number, number][] {
  const f = FONTS[font];
  const out: [number, number, number, number][] = [];
  let cx = x;
  for (const ch of text) {
    const g = f.glyphs[ch];
    if (!g) throw new Error(`pixelText: no glyph for "${ch}" in ${font}`);
    const oy = (g.length - f.rows) / 2; // 7-row '$' in a 5-row font -> starts 1px higher
    g.forEach((row, r) => {
      let i = 0;
      while (i < row.length) {
        if (row[i] !== 'X') {
          i++;
          continue;
        }
        let n = 1;
        while (i + n < row.length && row[i + n] === 'X') n++;
        out.push([cx + i, y + r - oy, n, 1]);
        i += n;
      }
    });
    cx += g[0]!.length + f.gap;
  }
  return out;
}

/** An SVG <path> string. Put it inside the tile/card SVG (or any SVG in art-px units). */
export function pixelTextSVG(
  text: string,
  x: number,
  y: number,
  color: string,
  font: FontName = 'font5',
  shadow?: string,
) {
  const d = (dx: number, dy: number) =>
    pixelTextRects(text, x + dx, y + dy, font)
      .map(([a, b, w]) => `M${a} ${b}h${w}v1h-${w}z`)
      .join('');
  return (
    (shadow ? `<path fill="${shadow}" d="${d(1, 1)}"/>` : '') +
    `<path fill="${color}" d="${d(0, 0)}" shape-rendering="crispEdges"/>`
  );
}

/** Canvas version. `scale` = screen pixels per art pixel (use a whole number of DEVICE pixels). */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: FontName = 'font5',
  scale = 1,
  shadow?: string,
) {
  const paint = (dx: number, dy: number, c: string) => {
    ctx.fillStyle = c;
    for (const [a, b, w, h] of pixelTextRects(text, x + dx, y + dy, font))
      ctx.fillRect(a * scale, b * scale, w * scale, h * scale);
  };
  if (shadow) paint(1, 1, shadow);
  paint(0, 0, color);
}

// ---- POGO presets (copy these, don't guess) ----
export const INK = '#101628',
  CREAM = '#f7f1e4';
/** Rent inside the owned-tile rent box. tileX/tileY = the tile's top-left on the board. */
export function rentOnTileSVG(rent: number, tileX: number, tileY: number) {
  const t = `$${rent}`,
    box = { x: 4, y: 1, w: 25 };
  return pixelTextSVG(
    t,
    tileX + box.x + Math.floor((box.w - measure(t).width) / 2),
    tileY + 3,
    INK,
    'font5',
  );
}
/** Price on an unowned tile (cream on the dark band). */
export function priceOnTileSVG(price: number, tileX: number, tileY: number) {
  const t = `$${price}`;
  return pixelTextSVG(
    t,
    tileX + Math.floor((33 - measure(t).width) / 2),
    tileY + 3,
    CREAM,
    'font5',
  );
}

/** A text the font can draw: capitals, and anything it has no glyph for becomes a "?" (names are free text). */
export function pixelSafe(text: string, font: FontName = 'font5'): string {
  return [...text.toUpperCase()].map((ch) => (FONTS[font].glyphs[ch] ? ch : '?')).join('');
}
