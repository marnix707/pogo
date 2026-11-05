import { measure, pixelSafe, pixelTextRects } from './pixel-text/pixelText';

export interface Part {
  text: string;
  colour: string;
  /** Extra art pixels before this part. */
  gap?: number;
}

const width = (parts: Part[]) =>
  parts.reduce((w, p, i) => w + (i ? (p.gap ?? 0) : 0) + measure(pixelSafe(p.text)).width, 0);

/**
 * Pixel text (font5) in an SVG of art pixels, drawn `s` css px per art pixel. `navy`: on a navy label (11 high,
 * corners cut by 1, 5 px padding), centred on the SVG's own width.
 */
export function PixelText({
  parts,
  s,
  navy = false,
  k = 1,
  testId,
}: {
  parts: Part[];
  s: number;
  navy?: boolean;
  /** Whole-number text scale (2 = every art pixel of the font is 2 x 2). */
  k?: number;
  testId?: string;
}) {
  const w = width(parts) * k;
  const W = navy ? w + 10 : w;
  const H = navy ? 11 : 5 * k;
  const ox = navy ? 5 : 0;
  const oy = navy ? 3 : 0;
  let x = ox;
  const paths = parts.map((p, i) => {
    if (i) x += (p.gap ?? 0) * k;
    const text = pixelSafe(p.text);
    const d = pixelTextRects(text, 0, 0)
      .map(([a, b, rw]) => `M${x + a * k} ${oy + b * k}h${rw * k}v${k}h-${rw * k}z`)
      .join('');
    x += measure(text).width * k;
    return <path key={i} d={d} fill={p.colour} />;
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W * s}
      height={H * s}
      shapeRendering="crispEdges"
      // (the "$" is 7 rows tall in a 5 row font: it must be allowed to stick out)
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={parts.map((p) => p.text).join('')}
      data-testid={testId}
    >
      {navy && (
        <path
          fill="#101628"
          d={`M1 0h${W - 2}v1h-${W - 2}zM0 1h${W}v9h-${W}zM1 10h${W - 2}v1h-${W - 2}z`}
        />
      )}
      {paths}
    </svg>
  );
}

/** The width in art pixels of a navy label with this text. */
export const labelWidth = (parts: Part[]) => width(parts) + 10;
