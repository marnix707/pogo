/**
 * The game card morphs from the Play screen to the top of the lobby: the Play screen remembers where
 * the tapped card was, the lobby slides its own top card in from there (a FLIP on one element).
 */
let remembered: { rect: DOMRect; at: number } | null = null;

/** The server has to answer before the lobby shows up: allow a slow connection. */
const MAX_AGE_MS = 8000;

export function rememberGameCard(el: Element | null) {
  remembered = el ? { rect: el.getBoundingClientRect(), at: Date.now() } : null;
}

/** Where the tapped card was (once): null when there is nothing recent to morph from. */
export function takeGameCardRect(): DOMRect | null {
  const r = remembered;
  remembered = null;
  return r && Date.now() - r.at < MAX_AGE_MS ? r.rect : null;
}

export const MORPH_MS = 420;
export const MORPH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Slide `el` from `from` to where it is now. */
export function morphFrom(el: HTMLElement, from: DOMRect) {
  const to = el.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02)
    return;
  el.animate(
    [
      { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: 'top left', transform: 'none' },
    ],
    { duration: MORPH_MS, easing: MORPH_EASE },
  );
}
