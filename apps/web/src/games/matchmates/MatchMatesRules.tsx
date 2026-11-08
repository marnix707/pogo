import { matchmates } from '@pogo/shared';
import type { ReactNode } from 'react';
import { Sheet } from '../../components/ui';
import { arenaUrl, hudUrl, monsterUrl, readySparkleUrl, tileUrl } from './art';

const { STAGE_SPECS, STAGES, ELEMENTS, MONSTERS } = matchmates;

/** A tile picture (the artist's 18 x 18 tiles, twice as big). */
const Tile = ({
  kind,
  className = '',
  style,
}: {
  kind: matchmates.TileKind;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <img
    src={tileUrl({ k: kind })}
    alt=""
    draggable={false}
    className={`absolute block ${className}`}
    style={{
      width: CELL - 0.15 + 'rem',
      height: CELL - 0.15 + 'rem',
      imageRendering: 'pixelated',
      ...style,
    }}
  />
);
const CELL = 2.4; // rem per tile in the demos

/** A titled block of the page: one picture / animation and a line or two. */
function Block({ title, children, line }: { title: string; children: ReactNode; line: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="label text-neon">{title}</h3>
      <div className="hud flex items-center justify-center !bg-panel/60 p-3">{children}</div>
      <p className="text-sm leading-snug">{line}</p>
    </section>
  );
}

/** Swap two neighbours, three in a row clear and new tiles drop in (loops). */
function SwapDemo() {
  const at = (i: number) => `${i * CELL}rem`;
  return (
    <div
      className="relative"
      style={{ width: `${4 * CELL}rem`, height: `${CELL}rem` }}
      data-testid="rules-swap"
    >
      {/* what drops in after the match */}
      {[1, 2, 3].map((i, k) => (
        <Tile
          key={`n${i}`}
          kind={(['earth', 'psychic', 'water'] as const)[k]!}
          className="rules-drop"
          style={{ left: at(i), animationDelay: `${k * 0.08}s` }}
        />
      ))}
      <Tile kind="fire" className="rules-swap-a" style={{ left: at(0) }} />
      <Tile kind="water" className="rules-swap-b" style={{ left: at(1) }} />
      <Tile kind="fire" className="rules-vanish" style={{ left: at(2) }} />
      <Tile kind="fire" className="rules-vanish" style={{ left: at(3) }} />
      {/* the finger: taps the first tile and slides it over the second */}
      <span
        aria-hidden
        className="rules-finger absolute rounded-full border-2 border-white/90 bg-white/25"
        style={{
          left: `${CELL / 2 - 0.55}rem`,
          top: `${CELL / 2 - 0.55}rem`,
          width: '1.1rem',
          height: '1.1rem',
        }}
      />
    </div>
  );
}

/** 4 / 5 / 6 in a line: what each gives you. */
function ComboDemo() {
  const rows: { n: number; text: ReactNode }[] = [
    { n: 4, text: <b>+1 move</b> },
    {
      n: 5,
      text: (
        <span className="flex items-center gap-1">
          <img
            src={hudUrl('heal-plus')}
            alt=""
            style={{ height: '1rem', imageRendering: 'pixelated' }}
          />
          <b>heal 5</b>
        </span>
      ),
    },
    { n: 6, text: <b>hit for 5</b> },
  ];
  return (
    <div className="flex w-full flex-col gap-2" data-testid="rules-combos">
      {rows.map((r, row) => (
        <div key={r.n} className="flex items-center gap-3">
          <div className="relative" style={{ width: `${r.n * 1.5}rem`, height: '1.5rem' }}>
            {Array.from({ length: r.n }, (_, i) => (
              <img
                key={i}
                src={tileUrl({ k: 'fire' })}
                alt=""
                className="rules-pulse absolute block"
                style={{
                  left: `${i * 1.5}rem`,
                  width: '1.4rem',
                  height: '1.4rem',
                  imageRendering: 'pixelated',
                  animationDelay: `${row * 0.5 + i * 0.1}s`,
                }}
              />
            ))}
          </div>
          <span className="rules-pop text-sm" style={{ animationDelay: `${row * 0.5 + 0.5}s` }}>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Matched tiles fly to your monster's mana bar; a full bar fires its special. */
function ManaDemo() {
  return (
    <div className="flex w-full items-center gap-3" data-testid="rules-mana">
      <div className="relative flex-1" style={{ height: '2.6rem' }}>
        <img
          src={hudUrl('charge-bar-fire')}
          alt=""
          className="absolute left-0 top-[1.4rem] block w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        <img
          src={hudUrl('charge-bar-fire-full')}
          alt=""
          className="rules-fill absolute left-0 top-[1.4rem] block w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        {[0, 1, 2].map((i) => (
          <img
            key={i}
            src={tileUrl({ k: 'fire' })}
            alt=""
            className="rules-fly absolute block"
            style={{
              left: `${i * 18}%`,
              top: 0,
              width: '1.3rem',
              height: '1.3rem',
              imageRendering: 'pixelated',
              animationDelay: `${i * 0.35}s`,
            }}
          />
        ))}
      </div>
      <div className="relative" style={{ width: '3.4rem', height: '3.4rem' }}>
        <img
          src={monsterUrl('fire', false)}
          alt=""
          className="rules-lunge absolute bottom-0 left-0 block"
          style={{ width: '3.1rem', imageRendering: 'pixelated' }}
        />
        <img
          src={readySparkleUrl('fire')}
          alt=""
          className="rules-ready absolute inset-0 block h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  );
}

/** Four berries, then the monster evolves. */
function EvolveDemo() {
  return (
    <div className="flex w-full items-center justify-center gap-4" data-testid="rules-evolve">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <img
            key={i}
            src={hudUrl('berry')}
            alt=""
            className="rules-berry block"
            style={{ width: '1.3rem', imageRendering: 'pixelated', animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
      <span aria-hidden className="text-xl">
        ›
      </span>
      <div className="relative" style={{ width: '3.6rem', height: '3.6rem' }}>
        <img
          src={monsterUrl('fire', false)}
          alt=""
          className="rules-before absolute bottom-0 left-1/2 block -translate-x-1/2"
          style={{ width: '2.8rem', imageRendering: 'pixelated' }}
        />
        <img
          src={monsterUrl('fire', true)}
          alt=""
          className="rules-after absolute bottom-0 left-1/2 block -translate-x-1/2"
          style={{ width: '3.4rem', imageRendering: 'pixelated' }}
        />
        <span
          aria-hidden
          className="rules-ring absolute left-1/2 top-1/2 block rounded-full border-2 border-[#fdcf51]"
          style={{ width: '3.4rem', height: '3.4rem' }}
        />
      </div>
    </div>
  );
}

export function MatchMatesRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Pet Match" full>
      <div className="flex flex-col gap-5 pb-4" data-testid="mates-rules">
        {/* the arenas first: a picture of each one and what it does */}
        <section className="flex flex-col gap-2">
          <h3 className="label text-neon">Arenas</h3>
          <ul
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
            data-testid="rules-arenas"
          >
            {STAGES.map((s) => (
              <li
                key={s}
                className="hud w-[78%] shrink-0 snap-start self-start !bg-panel/60 p-2"
                data-testid={`rules-arena-${s}`}
              >
                <img
                  src={arenaUrl(s, STAGE_SPECS)}
                  alt={STAGE_SPECS[s].name}
                  draggable={false}
                  className="block w-full rounded-sm"
                  style={{
                    imageRendering: 'pixelated',
                    aspectRatio: '160 / 90',
                    objectFit: 'cover',
                  }}
                />
                <p className="mt-2 text-sm font-bold uppercase tracking-wide">
                  {STAGE_SPECS[s].name}
                </p>
                <p className="text-sm leading-snug opacity-90">{STAGE_SPECS[s].rule}</p>
              </li>
            ))}
          </ul>
        </section>

        <Block
          title="Your turn"
          line={
            <>
              You get <b>2 moves</b>. Swap two neighbours to line up <b>3 or more</b>. A swap that
              matches nothing wastes the move.
            </>
          }
        >
          <SwapDemo />
        </Block>

        <Block
          title="Combos"
          line={<>Chains keep counting. Lines that cross (an L or a T) count together.</>}
        >
          <ComboDemo />
        </Block>

        <Block
          title="Mana and specials"
          line={
            <>
              Matches fill <b>your own</b> monster&apos;s mana bar. A full bar fires its special
              attack by itself.
            </>
          }
        >
          <ManaDemo />
        </Block>

        <Block
          title="Berries and evolve"
          line={
            <>
              Match berries to collect <b>4</b> (3 in Forest Valley). Tap a monster to <b>Evolve</b>{' '}
              it (one move), then to <b>Boost</b> it.
            </>
          }
        >
          <EvolveDemo />
        </Block>

        <section className="flex flex-col gap-2">
          <h3 className="label text-neon">The pets</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ELEMENTS.map((e) => (
              <li key={e} className="flex items-center gap-2">
                <img
                  src={monsterUrl(e, false)}
                  alt=""
                  style={{ width: '1.6rem', imageRendering: 'pixelated' }}
                />
                <span>
                  <b>{MONSTERS[e].names[0]}</b>{' '}
                  <span className="opacity-80">{MONSTERS[e].ability}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1.5 text-sm leading-snug">
          <h3 className="label text-neon">Goal</h3>
          <p>
            Bring your opponent&apos;s hit points to zero. Pick pets (1 - 2 - 1) and an arena; a
            coin flip decides whose arena is used, and the winner of the coin plays second with 5
            extra HP.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
