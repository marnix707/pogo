export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The text placer: how far (dx, dy) a box has to move to sit fully inside `bounds` with `margin` to spare, and
 * whether it is too wide for the bounds at all (then it has to wrap). Pure maths, so it can be tested; the
 * `FitText` component feeds it real measurements. Nothing on the Pet Match screen that says something
 * ("Puddlo is evolving...", "3 tiles to water!", "CHAIN x4!") may be placed without going through it.
 */
export function fitInto(
  box: Box,
  bounds: Box,
  margin = 6,
): { dx: number; dy: number; tooWide: boolean; tooTall: boolean } {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const room = {
    w: bounds.right - bounds.left - 2 * margin,
    h: bounds.bottom - bounds.top - 2 * margin,
  };
  const tooWide = width > room.w;
  const tooTall = height > room.h;
  let dx = 0;
  let dy = 0;
  if (box.left < bounds.left + margin) dx = bounds.left + margin - box.left;
  else if (box.right > bounds.right - margin) dx = bounds.right - margin - box.right;
  if (box.top < bounds.top + margin) dy = bounds.top + margin - box.top;
  else if (box.bottom > bounds.bottom - margin) dy = bounds.bottom - margin - box.bottom;
  // A box wider than the room cannot be moved inside: line it up with the left edge (it wraps and is measured again).
  if (tooWide) dx = bounds.left + margin - box.left;
  if (tooTall) dy = bounds.top + margin - box.top;
  return { dx, dy, tooWide, tooTall };
}
