import type { ReactNode } from 'react';
import type { bankrupt } from '@pogo/shared';
import { ICON_OF_TILE, BUILD_ICONS, art, tokenOf } from './art';
import { STEP_MS } from './timing';
import { gridPos } from './grid';

export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

type Tile = bankrupt.Tile;

/** One space of the ring: a coloured price band and name, or an icon for the corners and special spaces. */
function Space({
  tile,
  state,
  onTap,
}: {
  tile: Tile;
  state: bankrupt.BankruptState;
  onTap: () => void;
}) {
  const holding = state.owned[tile.id];
  const ownerSeat = holding ? state.players.findIndex((p) => p.id === holding.owner) : -1;
  const priced = tile.kind === 'property';
  const icon = ICON_OF_TILE[tile.id] ?? ICON_OF_TILE[tile.kind];
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid={`bk-tile-${tile.id}`}
      data-owner={holding?.owner ?? ''}
      aria-label={tile.name}
      className="relative flex w-full min-w-0 flex-1 flex-col items-stretch overflow-hidden bg-[#c3d5e0] text-left text-[#101628]"
    >
      {priced ? (
        <>
          <span
            className="block px-[6%] py-[2%] text-center text-[2.1cqw] font-bold leading-tight text-white/95"
            style={{ background: `color-mix(in srgb, ${tile.color} 72%, white)` }}
          >
            {money(tile.price)}
          </span>
          <span
            className="flex flex-1 items-center justify-center px-[4%] text-center text-[1.9cqw] font-bold uppercase leading-[1.1] text-white [overflow-wrap:anywhere]"
            style={{ background: tile.color }}
          >
            {tile.name}
          </span>
        </>
      ) : (
        <>
          <span className="block px-[4%] pt-[3%] text-center text-[1.8cqw] font-bold uppercase leading-tight text-[#2b3b57]">
            {tile.kind === 'transport' || tile.kind === 'utility' ? tile.name : ''}
          </span>
          <span className="flex min-h-0 flex-1 items-center justify-center">
            {icon && (
              <img
                src={art(icon)}
                alt=""
                draggable={false}
                className="max-h-full w-auto max-w-[70%] object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </span>
          <span className="block pb-[3%] text-center text-[1.8cqw] font-bold uppercase leading-tight text-[#2b3b57]">
            {tile.kind === 'transport' || tile.kind === 'utility'
              ? money(tile.price)
              : tile.kind === 'start' ||
                  tile.kind === 'jail' ||
                  tile.kind === 'auction' ||
                  tile.kind === 'card'
                ? tile.name
                : ''}
          </span>
        </>
      )}

      {/* The owner's colour along the bottom edge, and the buildings. */}
      {ownerSeat >= 0 && (
        <span
          className="absolute inset-x-0 bottom-0 h-[9%]"
          style={{ background: TOKEN_HEX[tokenOf(ownerSeat)] }}
          data-testid={`bk-owner-${tile.id}`}
        />
      )}
      {holding && holding.level > 0 && (
        <span className="absolute right-[3%] top-[26%] flex flex-col items-center">
          {Array.from({ length: holding.level }).map((_, i) => (
            <img
              key={i}
              src={art(BUILD_ICONS[Math.min(i, 2)]!)}
              alt=""
              className="h-[3.4cqw] w-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

export const TOKEN_HEX: Record<string, string> = {
  green: '#3fbf5f',
  yellow: '#fdcf51',
  blue: '#3aaef7',
  red: '#eb4a3f',
  purple: '#935adc',
  orange: '#f59a0b',
};

/** The square ring of spaces with `children` in the middle. `shown` is where each token is drawn (it walks). */
export function Board({
  state,
  shown,
  onTile,
  children,
}: {
  state: bankrupt.BankruptState;
  shown: Record<string, number>;
  onTile: (id: string) => void;
  children: ReactNode;
}) {
  const n = state.board.tiles.length;
  const dim = n / 4 + 1;
  return (
    <div className="[container-type:inline-size]" data-testid="bk-board">
      <div className="relative">
        <div
          className="grid aspect-square w-full gap-px overflow-hidden rounded-md border-2 border-[#101628] bg-[#101628]"
          style={{
            gridTemplateColumns: `repeat(${dim}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${dim}, minmax(0, 1fr))`,
          }}
        >
          {state.board.tiles.map((tile, i) => {
            const { row, col } = gridPos(i, n);
            return (
              <div
                key={tile.id}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
                className="flex min-w-0"
              >
                <Space tile={tile} state={state} onTap={() => onTile(tile.id)} />
              </div>
            );
          })}
          <div
            className="flex flex-col items-center justify-center gap-[3%] bg-[#c3d5e0] p-[2%]"
            style={{ gridRow: `2 / ${dim}`, gridColumn: `2 / ${dim}` }}
          >
            {children}
          </div>
        </div>
        {/* The tokens glide from space to space (and hop on every step). */}
        <div className="pointer-events-none absolute inset-0">
          {state.players.map((p, seat) => {
            if (p.bankrupt) return null;
            const at = shown[p.id] ?? p.pos;
            const { row, col } = gridPos(at, n);
            // Tokens that share a space stand side by side.
            const mates = state.players.filter((q) => !q.bankrupt && (shown[q.id] ?? q.pos) === at);
            const k = mates.findIndex((q) => q.id === p.id);
            const spread = mates.length > 1 ? (k - (mates.length - 1) / 2) * 3.4 : 0;
            return (
              <span
                key={p.id}
                data-testid={`bk-token-${p.id}`}
                data-at={at}
                className="absolute"
                style={{
                  left: `${((col + 0.5) / dim) * 100}%`,
                  top: `${((row + 0.5) / dim) * 100}%`,
                  transform: `translate(calc(-50% + ${spread}cqw), -50%)`,
                  transition: `left ${STEP_MS}ms linear, top ${STEP_MS}ms linear, transform ${STEP_MS}ms linear`,
                }}
              >
                <img
                  key={at}
                  src={art(`token-${tokenOf(seat)}`)}
                  alt=""
                  className="bk-hop block h-[5.4cqw] w-[5.4cqw] drop-shadow"
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
