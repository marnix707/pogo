import { useRef } from 'react';
import type { ReactNode } from 'react';
import { bankrupt } from '@pogo/shared';
import { gridPos } from './grid';
import { art } from './art';
import { BOARD_PX, INNER, TILE_PITCH, TILE_PX, cityArt, slug } from './cityArt';
import { STEP_MS } from './timing';
import { useArtScale } from './useArtScale';
import { measure, pixelTextSVG, priceOnTileSVG, rentOnTileSVG } from './pixel-text/pixelText';
import layout from '../../assets/sprites/bankrupt/city/card-layout.json';

const SPECIAL_DARK = (layout.groups as Record<string, string[]>).special![2]!;
export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

/** Token / owner-frame colour per seat (the kit has green, yellow, blue and red; purple and orange are recoloured). */
export const SEAT_COLOURS = ['green', 'yellow', 'blue', 'red', 'purple', 'orange'] as const;
export const seatColour = (seat: number) => SEAT_COLOURS[seat % SEAT_COLOURS.length]!;
export const SEAT_HEX: Record<string, string> = {
  green: '#56a786',
  yellow: '#fda200',
  blue: '#3aaef7',
  red: '#fd5f55',
  purple: '#935adc',
  orange: '#eb6b43',
};

const BUILD = ['build-house', 'build-shop', 'build-hotel'] as const;

/**
 * The board in the artist's pixel art: the 257 x 257 board picture, owner frames over owned spaces, buildings,
 * the tokens (they glide and hop) and invisible buttons over every space. Drawn at a whole number of device
 * pixels per art pixel. `children` go in the middle.
 */
export function Board({
  state,
  shown,
  onTile,
  pulse,
  onPulse,
  picked,
  overlay,
  children,
}: {
  state: bankrupt.BankruptState;
  shown: Record<string, number>;
  onTile: (id: string) => void;
  /** Spaces that pulse (a trade is waiting for the player to pick one of them) and what tapping one does. */
  pulse: Set<string>;
  onPulse: (id: string) => void;
  /** The space chosen for the trade (waiting for the confirmation). */
  picked: string | null;
  /** A pop-up (a card ...): drawn inside the middle of the board only, so it never covers a space. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const n = state.board.tiles.length;
  const dim = n / 4 + 1;
  const box = useRef<HTMLDivElement>(null);
  const s = useArtScale(box, BOARD_PX, true);
  const pct = (v: number) => `${(v / BOARD_PX) * 100}%`;
  const at = (i: number) => {
    const { row, col } = gridPos(i, n);
    return { x: col * TILE_PITCH, y: row * TILE_PITCH };
  };
  void dim;
  return (
    <div ref={box} className="-mx-3 w-[calc(100%+1.5rem)]" data-testid="bk-board">
      <div
        className="relative mx-auto [container-type:inline-size]"
        style={{ width: BOARD_PX * s, height: BOARD_PX * s }}
      >
        <img
          src={cityArt('board')}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* owned spaces: the artist's owned tile (the owner's colour in the band, no frame) with the rent on it, and buildings */}
        {state.board.tiles.map((tile, i) => {
          const holding = state.owned[tile.id];
          if (!holding) return null;
          const { x, y } = at(i);
          const seat = state.players.findIndex((p) => p.id === holding.owner);
          const file = tile.kind === 'property' ? `city-${slug(tile)}` : slug(tile);
          return (
            <span key={tile.id}>
              <img
                src={cityArt(`${file}-${seatColour(seat)}`)}
                alt=""
                data-testid={`bk-owner-${tile.id}`}
                className="pointer-events-none absolute"
                style={{
                  left: pct(x),
                  top: pct(y),
                  width: pct(TILE_PX),
                  imageRendering: 'pixelated',
                }}
              />
              {(tile.kind === 'property' || tile.kind === 'transport') && (
                <svg
                  aria-hidden
                  data-testid={`bk-rent-${tile.id}`}
                  viewBox={`0 0 ${TILE_PX} ${TILE_PX}`}
                  shapeRendering="crispEdges"
                  className="pointer-events-none absolute"
                  style={{ left: pct(x), top: pct(y), width: pct(TILE_PX), height: pct(TILE_PX) }}
                  // (pixelText draws the rent: the same pixels as the art)
                  dangerouslySetInnerHTML={{
                    __html: rentOnTileSVG(bankrupt.rentOf(state, tile), 0, 0),
                  }}
                />
              )}
              {holding.level > 0 && (
                <img
                  src={art(BUILD[Math.min(2, holding.level - 1)]!)}
                  alt=""
                  data-testid={`bk-level-${tile.id}`}
                  className="pointer-events-none absolute"
                  style={{
                    left: pct(x + 20),
                    top: pct(y + 19),
                    width: pct(12),
                    imageRendering: 'pixelated',
                  }}
                />
              )}
            </span>
          );
        })}
        {/* free special spaces: a dark band with the price at the top, the name at the bottom */}
        {state.board.tiles.map((tile, i) => {
          if (tile.kind !== 'transport' || state.owned[tile.id]) return null;
          const { x, y } = at(i);
          const label = (tile.id === 'electricity' ? 'POWER' : tile.name).toUpperCase();
          return (
            <svg
              key={`sp-${tile.id}`}
              aria-hidden
              data-testid={`bk-special-${tile.id}`}
              viewBox={`0 0 ${TILE_PX} ${TILE_PX}`}
              shapeRendering="crispEdges"
              className="pointer-events-none absolute"
              style={{ left: pct(x), top: pct(y), width: pct(TILE_PX), height: pct(TILE_PX) }}
            >
              <rect x={1} y={2} width={31} height={8} fill={SPECIAL_DARK} />
              <g dangerouslySetInnerHTML={{ __html: priceOnTileSVG(tile.price, 0, 0) }} />
              <rect x={2} y={25} width={29} height={6} fill="#f7f1e4" />
              <g
                dangerouslySetInnerHTML={{
                  __html: pixelTextSVG(
                    label,
                    Math.floor((TILE_PX - measure(label, 'font4').width) / 2),
                    26,
                    '#3f7a62',
                    'font4',
                  ),
                }}
              />
            </svg>
          );
        })}
        {/* the spaces that may be picked pulse */}
        {state.board.tiles.map((tile, i) => {
          if (!pulse.has(tile.id)) return null;
          const { x, y } = at(i);
          return (
            <span
              key={`p-${tile.id}`}
              data-testid={`bk-pulse-${tile.id}`}
              className={`${picked === tile.id ? 'bk-picked' : 'bk-pulse'} pointer-events-none absolute`}
              style={{ left: pct(x), top: pct(y), width: pct(TILE_PX), height: pct(TILE_PX) }}
            />
          );
        })}
        {/* the space buttons */}
        {state.board.tiles.map((tile, i) => {
          const { x, y } = at(i);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => (pulse.has(tile.id) ? onPulse(tile.id) : onTile(tile.id))}
              data-testid={`bk-tile-${tile.id}`}
              data-owner={state.owned[tile.id]?.owner ?? ''}
              aria-label={tile.name}
              className="absolute"
              style={{ left: pct(x), top: pct(y), width: pct(TILE_PX), height: pct(TILE_PX) }}
            />
          );
        })}
        {/* the middle */}
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center gap-[2%]"
          style={{
            left: pct(INNER[0]),
            top: pct(INNER[1]),
            width: pct(INNER[2]),
            height: pct(INNER[3]),
          }}
        >
          <img
            src={cityArt('city-hall')}
            alt=""
            draggable={false}
            style={{ width: pct(86), imageRendering: 'pixelated' }}
          />
          {children}
        </div>
        {/* pop-ups live inside the middle of the board */}
        {overlay && (
          <div
            className="absolute z-20 overflow-hidden"
            style={{
              left: pct(INNER[0]),
              top: pct(INNER[1]),
              width: pct(INNER[2]),
              height: pct(INNER[3]),
            }}
            data-testid="bk-overlay"
          >
            {overlay}
          </div>
        )}
        {/* the tokens glide from space to space (and hop on every step) */}
        <div className="pointer-events-none absolute inset-0">
          {state.players.map((p, seat) => {
            if (p.bankrupt) return null;
            const pos = shown[p.id] ?? p.pos;
            const { x, y } = at(pos);
            const mates = state.players.filter(
              (q) => !q.bankrupt && (shown[q.id] ?? q.pos) === pos,
            );
            const k = mates.findIndex((q) => q.id === p.id);
            // Tokens that share a space stand side by side (closer, and staggered, when there are many).
            const step = mates.length > 3 ? 5 : mates.length > 1 ? 9 : 0;
            const spread = (k - (mates.length - 1) / 2) * step;
            const stagger = mates.length > 2 ? (k % 2 === 0 ? -3 : 3) : 0;
            return (
              <span
                key={p.id}
                data-testid={`bk-token-${p.id}`}
                data-at={pos}
                className="absolute"
                style={{
                  left: pct(x + TILE_PX / 2 + spread),
                  top: pct(y + TILE_PX / 2 + stagger),
                  width: pct(18),
                  transform: 'translate(-50%, -62%)',
                  // The token is in the air for most of the step: it travels while it hops, then lands.
                  transition: `left ${Math.round(STEP_MS * 0.8)}ms ease-in-out, top ${Math.round(STEP_MS * 0.8)}ms ease-in-out`,
                }}
              >
                <img
                  key={pos}
                  src={cityArt(`token-${seatColour(seat)}`)}
                  alt=""
                  className="bk-hop block w-full"
                  style={{ imageRendering: 'pixelated', animationDuration: `${STEP_MS}ms` }}
                />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
