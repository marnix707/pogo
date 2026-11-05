import type { bankrupt } from '@pogo/shared';
import layout from '../../assets/sprites/bankrupt/city/card-layout.json';
import { cityArt, slug } from './cityArt';
import { CARD_H, CARD_W, LABEL, NAVY, Title, headerKey, text } from './PropertyCard';

const L = layout.layout;

/** A small, read-only version of a space's card (the front without buttons): `width` is in board units (cqw). */
export function MiniCard({ tile, width }: { tile: bankrupt.OwnableTile; width: number }) {
  const header = L.header;
  const title = text(tile.name, header[0]! + header[2]! / 2 - 4, header[1]! + 9, 2);
  const stats: [string, string][] = [
    ['PRICE', `$${tile.price}`],
    ['RENT', `$${tile.rent[0]}`],
    ['SELL', `$${tile.sell}`],
  ];
  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      style={{ width: `${width}cqw`, imageRendering: 'pixelated', display: 'block' }}
      shapeRendering="crispEdges"
      role="img"
      aria-label={tile.name}
      data-testid={`bk-mini-${tile.id}`}
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
      {stats.map(([label, value], i) => (
        <g key={label}>
          <path d={text(label, L.cols_cx[i]!, L.labels_y)} fill={LABEL} />
          <path d={text(value, L.cols_cx[i]!, L.values_y, 2)} fill={NAVY} />
        </g>
      ))}
      <image
        href={cityArt(`art-${slug(tile)}`)}
        x={L.art[0]}
        y={L.art[1]}
        width={L.art[2]}
        height={L.art[3]}
      />
    </svg>
  );
}
