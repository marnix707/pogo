import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { bankrupt } from '@pogo/shared';
import font from '../../assets/sprites/bankrupt/city/pixel-font.json';
import layout from '../../assets/sprites/bankrupt/city/card-layout.json';
import { art } from './art';
import { cityArt, slug } from './cityArt';
import { useArtScale } from './useArtScale';

type Glyphs = Record<string, string[]>;
const FONT5 = font.font5 as Glyphs;
const TAG7 = font.tag_digits7 as Glyphs;
const L = layout.layout;
export const CARD_W = 152;
/** The card is 192 high plus its 3 px shadow. */
export const CARD_H = 195;
export const NAVY = '#101628';
export const LABEL = '#796e9e';

/** The pixels of a text in the kit's font as one path (card art px). `align` says what `x` means. */
export function text(
  str: string,
  x: number,
  y: number,
  scale = 1,
  gap = 1,
  align: 'centre' | 'left' | 'right' = 'centre',
  glyphsOf: Glyphs = FONT5,
): string {
  const glyphs = [...str.toUpperCase()].map((c) => glyphsOf[c] ?? glyphsOf['?'] ?? glyphsOf['0']!);
  const widths = glyphs.map((g) => g[0]!.length * scale);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (glyphs.length - 1);
  let at = Math.round(align === 'left' ? x : align === 'right' ? x - total : x - total / 2);
  const out: string[] = [];
  glyphs.forEach((g, i) => {
    // The '$' of the big font has seven rows: it stands one pixel higher than the letters.
    const dy = glyphsOf === FONT5 && g.length > 5 ? -1 : 0;
    g.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch === 'X')
          out.push(`M${at + c * scale} ${y + dy + r * scale}h${scale}v${scale}h-${scale}z`);
      }),
    );
    at += widths[i]! + gap;
  });
  return out.join('');
}

const dollars = (n: number) => `$${n}`;
export const headerKey = (tile: bankrupt.OwnableTile) =>
  tile.kind === 'property' ? tile.group : 'special';

export interface CardAction {
  /** The kit button to draw. */
  kind: 'buy' | 'sell' | 'upgrade';
  enabled: boolean;
  onClick: () => void;
  testId: string;
  label: string;
  /** Upgrade only: the price on the hanging tag. */
  tag?: number;
}

/** The title: white with a navy outline and shadow. */
export function Title({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill={NAVY} transform="translate(1 1)" />
      {[
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].map(([dx, dy]) => (
        <path key={`${dx},${dy}`} d={d} fill={NAVY} transform={`translate(${dx} ${dy})`} />
      ))}
      <path d={d} fill="#fff" />
    </>
  );
}

const hot = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / CARD_W) * 100}%`,
  top: `${(y / CARD_H) * 100}%`,
  width: `${(w / CARD_W) * 100}%`,
  height: `${(h / CARD_H) * 100}%`,
});

/**
 * A property card, built in code from the artist's parts (base, header, art, buttons, upgrade tag, X) and the pixel
 * font, so the numbers are ours (the finished cards of the kit hold placeholder numbers). Tap the picture and the
 * card turns over to show the rent for every building; tap it again to turn back. Tap the X for `onClose`.
 */
export function PropertyCard({
  tile,
  level,
  rent,
  actions,
  onClose,
  closeLabel = 'Close',
}: {
  tile: bankrupt.OwnableTile;
  /** Buildings on it (0-3), for the rent table on the back. */
  level: number;
  rent: number;
  /** One action is drawn centred; two are drawn left and right (sell / upgrade). */
  actions: CardAction[];
  onClose: () => void;
  closeLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The card fits the box it is put in (the middle of the board): never bigger than that.
  const s = useArtScale(box, CARD_W, true, CARD_H);
  const [flipped, setFlipped] = useState(false);
  const stats: [string, string][] = [
    ['PRICE', dollars(tile.price)],
    ['RENT', dollars(rent)],
    ['SELL', dollars(tile.sell)],
  ];
  const cols = L.cols_cx;
  const header = L.header;
  const title = text(tile.name, header[0]! + header[2]! / 2 - 4, header[1]! + 9, 2, 2);
  const slots =
    actions.length === 1
      ? [[(CARD_W - 64) / 2, L.buttons[0]![1]!, 64, 20] as const]
      : [L.buttons[0]!, L.buttons[1]!];
  const btnUrl = (a: CardAction) => cityArt(`button-${a.kind}${a.enabled ? '' : '-disabled'}`);
  const size = { width: CARD_W * s, height: CARD_H * s };
  const closeBtn = (id: string) => (
    <button
      type="button"
      data-testid={id}
      aria-label={closeLabel}
      onClick={onClose}
      className="absolute"
      style={hot(L.close_x[0]! - 2, L.close_x[1]! - 2, 19, 21)}
    />
  );
  const svgProps = {
    viewBox: `0 0 ${CARD_W} ${CARD_H}`,
    width: CARD_W * s,
    height: CARD_H * s,
    shapeRendering: 'crispEdges' as const,
    style: { imageRendering: 'pixelated' as const, display: 'block' },
  };
  const face = (children: ReactNode) => (
    <svg
      {...svgProps}
      role="img"
      aria-label={`${tile.name}: price $${tile.price}, rent $${rent}, sell $${tile.sell}`}
    >
      <image href={cityArt('card-base')} x={0} y={0} width={CARD_W} height={CARD_H} />
      <image
        href={cityArt(`header-${headerKey(tile)}`)}
        x={header[0]}
        y={header[1]}
        width={header[2]}
        height={header[3]}
      />
      <Title d={title} />
      {children}
      <image
        href={cityArt('button-close-x')}
        x={L.close_x[0]}
        y={L.close_x[1]}
        width={15}
        height={17}
      />
    </svg>
  );

  // ---- the back: the rent for every building
  const rows: { icon: string | null; label: string; value: number }[] =
    tile.kind === 'property'
      ? [
          { icon: null, label: 'EMPTY', value: tile.rent[0]! },
          { icon: null, label: 'FULL SET', value: tile.rent[0]! * 2 },
          { icon: 'build-house', label: 'HOUSE', value: tile.rent[1]! },
          { icon: 'build-shop', label: 'SHOP', value: tile.rent[2]! },
          { icon: 'build-hotel', label: 'HOTEL', value: tile.rent[3]! },
        ]
      : tile.rent.map((r, i) => ({
          icon: null,
          label: `${i + 1} OF ${tile.rent.length}`,
          value: r,
        }));
  const rowH = rows.length > 4 ? 24 : 28;
  const current = tile.kind === 'property' ? level + 1 : -1;
  const back = face(
    <>
      <path d={text('RENT', CARD_W / 2, 37, 1, 1)} fill={LABEL} />
      {rows.map((r, i) => {
        const y = 50 + i * rowH;
        const on = tile.kind === 'property' ? (level === 0 ? i === 0 : i === level + 1) : false;
        return (
          <g key={r.label}>
            {on && (
              <rect x={10} y={y - 4} width={132} height={rowH - 6} fill="#fdcf51" opacity="0.55" />
            )}
            {r.icon && <image href={art(r.icon)} x={12} y={y - 3} width={12} height={12} />}
            <path d={text(r.label, r.icon ? 28 : 14, y + 1, 1, 1, 'left')} fill={LABEL} />
            <path d={text(dollars(r.value), 138, y - 2, 2, 2, 'right')} fill={NAVY} />
          </g>
        );
      })}
      <path d={text('TAP TO TURN BACK', CARD_W / 2, 176, 1, 1)} fill={LABEL} />
    </>,
  );
  void current;

  // ---- the front
  const upgrade = actions.find((a) => a.kind === 'upgrade');
  const upIndex = actions.length === 1 ? -1 : actions.findIndex((a) => a.kind === 'upgrade');
  const tagText = upgrade?.tag !== undefined ? dollars(upgrade.tag) : null;
  const tagUrl = tagText
    ? cityArt(`upgrade-tag-${tagText.length >= 4 ? 4 : 3}${upgrade!.enabled ? '' : '-disabled'}`)
    : null;
  const tagW = tagText && tagText.length >= 4 ? 36 : 31;
  const tagX = upIndex >= 0 ? slots[upIndex]![0] + (64 - tagW) / 2 + 2 : 0;
  const tagY = upIndex >= 0 ? slots[upIndex]![1] - 17 + 1 : 0;
  const front = face(
    <>
      {stats.map(([label, value], i) => (
        <g key={label}>
          <path d={text(label, cols[i]!, L.labels_y, 1, 1)} fill={LABEL} />
          <path d={text(value, cols[i]!, L.values_y, 2, 2)} fill={NAVY} />
        </g>
      ))}
      {Array.from({ length: 70 }).map((_, i) => (
        <rect key={i} x={6 + i * 2} y={59} width={1} height={1} fill="#dcd3c0" />
      ))}
      <image
        href={cityArt(`art-${slug(tile)}`)}
        x={L.art[0]}
        y={L.art[1]}
        width={L.art[2]}
        height={L.art[3]}
      />
      {actions.map((a, i) => (
        <image
          key={a.kind + i}
          href={btnUrl(a)}
          x={slots[i]![0]}
          y={slots[i]![1]}
          width={64}
          height={23}
        />
      ))}
      {tagUrl && upIndex >= 0 && (
        <>
          <image href={tagUrl} x={tagX} y={tagY} width={tagW} height={17} />
          <path
            d={text(tagText!, tagX + 10 + (tagW - 12 - 0) / 2 - 0, tagY + 3, 1, 1, 'centre', TAG7)}
            fill={upgrade!.enabled ? NAVY : LABEL}
          />
        </>
      )}
    </>,
  );

  const faceStyle = {
    backfaceVisibility: 'hidden' as const,
    WebkitBackfaceVisibility: 'hidden' as const,
  };
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div style={{ ...size, perspective: 900 }}>
        <div
          className="relative bk-flip"
          style={{
            ...size,
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
          data-testid="bk-card"
          data-tile={tile.id}
          data-flipped={flipped}
        >
          <div className="absolute inset-0" style={faceStyle}>
            {front}
            {/* the picture turns the card over */}
            <button
              type="button"
              data-testid="bk-card-flip"
              aria-label="Show the rent for every building"
              onClick={() => setFlipped(true)}
              className="absolute"
              style={hot(L.art[0]!, L.art[1]!, L.art[2]!, L.art[3]!)}
            />
            {actions.map((a, i) => (
              <button
                key={a.kind + i}
                type="button"
                data-testid={a.testId}
                aria-label={a.label}
                disabled={!a.enabled}
                onClick={a.onClick}
                className="absolute"
                style={hot(slots[i]![0], slots[i]![1], slots[i]![2] ?? 64, slots[i]![3] ?? 20)}
              />
            ))}
            {closeBtn('bk-card-close')}
          </div>
          <div className="absolute inset-0" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
            {back}
            <button
              type="button"
              data-testid="bk-card-unflip"
              aria-label="Turn the card back"
              onClick={() => setFlipped(false)}
              className="absolute"
              style={hot(0, 30, CARD_W, 150)}
            />
            {closeBtn('bk-card-close-back')}
          </div>
        </div>
      </div>
    </div>
  );
}
