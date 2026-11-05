import { useRef } from 'react';
import type { ReactNode } from 'react';
import { bankrupt } from '@pogo/shared';
import { chevronsPath, tileChevronsAt } from './chevrons';
import { gridPos } from './grid';
import { FROG_OFFSETS } from './frog';
import { FrogToken } from './FrogToken';
import { BOARD_PX, INNER, TILE_PITCH, TILE_PX, cityArt, slug } from './cityArt';
import { useArtScale } from './useArtScale';
import { measure, pixelTextSVG, priceOnTileSVG, rentOnTileSVG } from './pixel-text/pixelText';
import layout from '../../assets/sprites/bankrupt/city/card-layout.json';

const SPECIAL_DARK = (layout.groups as Record<string, string[]>).special![2]!;
export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

/** The colour of a player: by the order they joined the room (host red, second blue ...), whatever the seat. */
export const playerColour = (p: { colour: number }) =>
  bankrupt.PLAYER_COLOURS[p.colour % bankrupt.PLAYER_COLOURS.length]!;
export const SEAT_HEX: Record<string, string> = {
  green: '#56a786',
  yellow: '#fda200',
  blue: '#3aaef7',
  red: '#fd5f55',
  purple: '#935adc',
  orange: '#eb6b43',
};

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
  clear = false,
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
  /** The hall and the middle (die, note) shrink away, e.g. while a trade fills the middle. */
  clear?: boolean;
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
    <div
      ref={box}
      // The whole screen wide (up to the app's column), centred on the column whatever the padding around it.
      className="relative left-1/2 w-[min(100vw,32rem)] -translate-x-1/2"
      data-testid="bk-board"
    >
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
                src={cityArt(`${file}-${playerColour(state.players[seat]!)}`)}
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
                >
                  {/* (pixelText draws the rent: the same pixels as the art) */}
                  <g
                    dangerouslySetInnerHTML={{
                      __html: rentOnTileSVG(bankrupt.rentOf(state, tile), 0, 0),
                    }}
                  />
                  {/* one ^ per upgrade, stacked beside the rent like rank insignia */}
                  {holding.level > 0 && tile.kind === 'property' && (
                    <path
                      data-testid={`bk-level-${tile.id}`}
                      data-level={holding.level}
                      fill="#101628"
                      d={chevronsPath(
                        holding.level,
                        tileChevronsAt(holding.level).x,
                        tileChevronsAt(holding.level).y,
                      )}
                    />
                  )}
                </svg>
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
            className={clear ? 'bk-away' : 'transition-[opacity,transform] duration-300'}
            style={{ width: pct(86), imageRendering: 'pixelated' }}
          />
          <div
            className={`flex flex-col items-center gap-[2%] ${clear ? 'bk-away' : ''}`}
          >
            {children}
          </div>
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
        {/* the frogs hop from space to space */}
        <div className="pointer-events-none absolute inset-0">
          {state.players.map((p) => {
            if (p.bankrupt) return null;
            const pos = shown[p.id] ?? p.pos;
            const { x, y } = at(pos);
            const mates = state.players.filter(
              (q) => !q.bankrupt && (shown[q.id] ?? q.pos) === pos,
            );
            // Alone a frog sits in the middle of the space; with company each has a place by colour.
            const [ox, oy] = mates.length > 1 ? FROG_OFFSETS[p.colour % 6]! : [0, 0];
            return (
              <FrogToken
                key={p.id}
                testId={`bk-token-${p.id}`}
                colour={playerColour(p)}
                pos={pos}
                n={n}
                at={(i) => {
                  const g = at(i);
                  return { x: g.x + 16, y: g.y + 16 };
                }}
                left={pct(x + 16 + ox)}
                top={pct(y + 16 + oy)}
                width={pct(19)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
