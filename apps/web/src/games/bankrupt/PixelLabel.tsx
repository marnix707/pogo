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

/**
 * A pixel panel: a 1 px navy border, a light row along the top inside, and a solid navy shadow of `shadow` art px
 * under it. `w` x `h` is the body (the shadow comes on top of that).
 */
export function PixelPanel({
  s,
  w,
  h,
  shadow,
  fill,
  light = '#fff4b4',
}: {
  s: number;
  w: number;
  h: number;
  shadow: number;
  fill: string;
  light?: string;
}) {
  return (
    <svg
      aria-hidden
      className="absolute left-0 top-0 block"
      width={w * s}
      height={(h + shadow) * s}
      viewBox={`0 0 ${w} ${h + shadow}`}
      shapeRendering="crispEdges"
    >
      <rect x="1" y={h} width={w - 1} height={shadow} fill="#101628" />
      <rect x="0" y="0" width={w} height={h} fill="#101628" />
      <rect x="1" y="1" width={w - 2} height={h - 2} fill={fill} />
      <rect
        x="1"
        y="1"
        width={w - 2}
        height="1"
        fill={light}
        opacity={fill === '#101628' ? 0.18 : 1}
      />
    </svg>
  );
}
