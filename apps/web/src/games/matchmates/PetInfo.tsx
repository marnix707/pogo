import { useState } from 'react';
import type { MouseEvent } from 'react';
import { matchmates } from '@pogo/shared';
import { monsterUrl } from './art';

const { MONSTERS } = matchmates;

const px = { imageRendering: 'pixelated' } as const;
const WIDTH = 224;

interface Anchor {
  element: matchmates.Element;
  evolved: boolean;
  /** Viewport spot under (or over) the pet the bubble points at. */
  x: number;
  top: number;
  bottom: number;
}

/**
 * Tap a pet, any time (arena choice or in the game), to get the same little bubble that explains a rule in
 * the Karma lobby (`.info-bubble`): its names, mana cost, special and what it does evolved. Tap again or
 * anywhere else to close. Use `open(event, element, evolved)` on the pet's onClick and render `bubble`.
 */
export function usePetInfo() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = (e: MouseEvent<HTMLElement>, element: matchmates.Element, evolved = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor((a) =>
      a && a.element === element && a.evolved === evolved
        ? null
        : { element, evolved, x: r.left + r.width / 2, top: r.top, bottom: r.bottom },
    );
  };

  let bubble = null;
  if (anchor) {
    const spec = MONSTERS[anchor.element];
    const form = anchor.evolved ? 1 : 0;
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, anchor.x - WIDTH / 2));
    // Below the pet, unless there is no room there.
    const below = anchor.bottom + 190 < window.innerHeight;
    const arrowLeft = Math.max(14, Math.min(WIDTH - 26, anchor.x - left - 6));
    bubble = (
      <>
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setAnchor(null)}
        />
        <div
          role="status"
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
            <div className="mb-1 flex items-end gap-2">
              <img
                src={monsterUrl(anchor.element, anchor.evolved)}
                alt=""
                draggable={false}
                style={px}
                className="h-10"
              />
              <b className="leading-tight">
                {spec.names[form]}
                <span className="block text-xs font-normal text-muted">
                  {anchor.element} · special at {spec.cost} mana
                </span>
              </b>
            </div>
            <p className="text-xs">{spec.ability}</p>
            <p className="mt-1 text-xs text-muted">
              Damage {spec.damage[0]}, evolved {spec.damage[1]}
              {spec.heal[0] > 0 ? ` · heal ${spec.heal[0]}, evolved ${spec.heal[1]}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted">
              {anchor.evolved
                ? 'Evolved: 4 berries boost it with 4 mana.'
                : `Evolves into ${spec.names[1]} (berries, takes your turn).`}
            </p>
          </div>
        </div>
      </>
    );
  }
  return { open, bubble, close: () => setAnchor(null) };
}
