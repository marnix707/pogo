import { Fragment, useState } from 'react';
import type { MouseEvent } from 'react';
import { matchmates } from '@pogo/shared';
import { monsterUrl } from './art';

const { MONSTERS, BOOST_MANA } = matchmates;

const px = { imageRendering: 'pixelated' } as const;
const WIDTH = 256;

/** What the pop-up of one of my own pets can do (the game gives it live, so it follows the berries). */
export interface PetActions {
  /** Berries I hold and what an evolve / boost costs. */
  berries: number;
  need: number;
  /** It is my turn and nothing is animating. */
  canAct: boolean;
  /** Is this pet evolved already (then the button boosts instead). */
  evolved: boolean;
  color: string;
  run: () => void;
}

interface Anchor {
  element: matchmates.Element;
  /** Viewport box of the pet the pop-up points at. */
  x: number;
  top: number;
  bottom: number;
}

/**
 * Tap a pet, any time (arena choice or in the game), for its pop-up (the same `.info-bubble` look as the
 * Karma lobby): both forms side by side as tabs, every number, the special, and for my own pets the Evolve
 * (or Boost) button, greyed out until there are enough berries. Tap again or anywhere else to close.
 * `actions(element)` gives the button's live state for my own pets (null = just information).
 */
export function usePetInfo(actions?: (element: matchmates.Element) => PetActions | null) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [form, setForm] = useState<0 | 1>(0);
  const open = (e: MouseEvent<HTMLElement>, element: matchmates.Element, evolved = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (anchor?.element === element) return setAnchor(null);
    setForm(evolved ? 1 : 0);
    setAnchor({ element, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  let bubble = null;
  if (anchor) {
    const spec = MONSTERS[anchor.element];
    const act = actions?.(anchor.element) ?? null;
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, anchor.x - WIDTH / 2));
    // Below the pet, unless there is no room there.
    const below = anchor.bottom + 300 < window.innerHeight;
    const arrowLeft = Math.max(14, Math.min(WIDTH - 26, anchor.x - left - 6));
    const full = !!act && act.berries >= act.need;
    bubble = (
      <>
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setAnchor(null)}
        />
        <div
          role="dialog"
          aria-label={spec.names[form]}
          data-testid="mates-pet-info"
          className="info-bubble fixed z-50"
          style={{
            left,
            width: WIDTH,
            ...(below
              ? { top: anchor.bottom + 10 }
              : { bottom: window.innerHeight - anchor.top + 10 }),
          }}
        >
          <span
            aria-hidden
            className={`absolute h-3 w-3 rotate-45 border-edge/40 bg-panel2 ${
              below ? '-top-[7px] border-l-2 border-t-2' : '-bottom-[7px] border-b-2 border-r-2'
            }`}
            style={{ left: arrowLeft }}
          />
          <div className="relative rounded-lg border-2 border-edge/40 bg-panel2 px-3 py-2 text-left text-sm font-normal text-ink shadow-lg">
            {/* Unevolved / evolved */}
            <div className="mb-2 grid grid-cols-2 gap-1" role="tablist">
              {([0, 1] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={form === f}
                  data-testid={`mates-pet-form-${f}`}
                  onClick={() => setForm(f)}
                  className={`flex items-end justify-center gap-1 rounded-md border-2 px-1 pt-1 text-[10px] font-bold uppercase ${
                    form === f ? 'border-neon bg-neon/15' : 'border-edge/30 opacity-70'
                  }`}
                >
                  <img
                    src={monsterUrl(anchor.element, f === 1)}
                    alt=""
                    draggable={false}
                    style={px}
                    className={f === 1 ? 'h-12' : 'h-10'}
                  />
                  <span className="pb-1">{f === 1 ? 'Evolved' : 'Base'}</span>
                </button>
              ))}
            </div>
            <b className="block leading-tight">{spec.names[form]}</b>
            <span className="block text-xs capitalize text-muted">
              {anchor.element} · special at {spec.cost} mana
            </span>
            <p className="mt-1 text-xs">{spec.ability}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
              {(
                [
                  ['Damage', spec.damage],
                  ['Heals', spec.heal],
                  ['Power', spec.power],
                ] as const
              ).map(([label, v]) =>
                v[form] > 0 ? (
                  <Fragment key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-bold" data-testid={`pet-stat-${label.toLowerCase()}`}>
                      {v[form]}
                      {/* The evolved form shows what it gains over the base form, in grey: 15 +5 */}
                      {form === 1 && v[1] > v[0] && (
                        <span className="ml-1 font-normal text-muted" data-testid="pet-stat-gain">
                          +{v[1] - v[0]}
                        </span>
                      )}
                    </dd>
                  </Fragment>
                ) : null,
              )}
              <dt className="text-muted">Mana</dt>
              <dd className="font-bold">{spec.cost}</dd>
            </dl>
            {act && (
              <button
                type="button"
                data-testid="mates-pet-action"
                data-full={full}
                disabled={!act.canAct || !full}
                onClick={() => {
                  act.run();
                  setAnchor(null);
                }}
                className="relative mt-2 min-h-11 w-full overflow-hidden rounded-md border-2 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
                style={{ borderColor: act.color }}
              >
                {/* The berries as a loading bar in the pet's colour; it pulses when it is full. */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${
                    full ? 'animate-pulse' : ''
                  }`}
                  style={{
                    width: `${Math.min(100, (act.berries / act.need) * 100)}%`,
                    background: act.color,
                  }}
                />
                <span className="relative [text-shadow:0_1px_0_#101628,0_0_2px_#101628]">
                  {act.evolved ? `Boost +${BOOST_MANA} mana` : 'Evolve'} (
                  {Math.min(act.berries, act.need)}/{act.need})
                </span>
              </button>
            )}
          </div>
        </div>
      </>
    );
  }
  return { open, bubble, close: () => setAnchor(null) };
}
