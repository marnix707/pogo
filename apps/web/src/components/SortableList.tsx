import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Drag {
  id: string;
  from: number;
  over: number;
  dy: number;
  /** Let go: the card slides into its place before the new order is kept. */
  settling: boolean;
}

/** `ids` with the one at `from` moved to `to`. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

/**
 * A list whose rows the player drags into a new order by their grip (the dotted squares; a touch anywhere else scrolls the page): the held row follows the finger, the others slide out of
 * the way (CSS transitions), and on release the row glides into its slot. Every row wiggles a little and
 * carries a grip, so it is clear that all of them can be moved.
 */
export function SortableList({
  items,
  onReorder,
  render,
  gap = 12,
}: {
  items: { id: string }[];
  onReorder: (ids: string[]) => void;
  render: (id: string) => ReactNode;
  gap?: number;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const geo = useRef<{ tops: number[]; heights: number[]; startY: number }>({
    tops: [],
    heights: [],
    startY: 0,
  });
  const lastClientY = useRef(0);
  const ids = items.map((i) => i.id);

  // Where each slot starts when the list is in the order `order` (heights differ a little).
  const slotTops = (order: number[]) => {
    const { tops, heights } = geo.current;
    let y = tops[0]!;
    const out: number[] = [];
    for (const i of order) {
      out[i] = y;
      y += heights[i]! + gap;
    }
    return out;
  };

  const update = (from: number) => {
    const { tops, heights, startY } = geo.current;
    const pageY = lastClientY.current + window.scrollY;
    const last = ids.length - 1;
    const minDy = tops[0]! - tops[from]!;
    const maxDy = tops[last]! + heights[last]! - heights[from]! - tops[from]!;
    const dy = Math.max(minDy, Math.min(maxDy, pageY - startY));
    const centre = tops[from]! + dy + heights[from]! / 2;
    // The slot whose middle is nearest to the middle of the held row.
    let over = from;
    let best = Infinity;
    for (let k = 0; k < ids.length; k++) {
      const order = moved(
        ids.map((_, i) => i),
        from,
        k,
      );
      const top = slotTops(order)[from]!;
      const d = Math.abs(top + heights[from]! / 2 - centre);
      if (d < best) {
        best = d;
        over = k;
      }
    }
    setDrag((d) => (d && !d.settling ? { ...d, dy, over } : d));
  };

  // Near the top or bottom edge of the screen the page scrolls along with the drag.
  useEffect(() => {
    if (!drag || drag.settling) return;
    const t = setInterval(() => {
      const y = lastClientY.current;
      const edge = 90;
      const step = y < edge ? -12 : y > window.innerHeight - edge ? 12 : 0;
      if (step !== 0) {
        window.scrollBy(0, step);
        update(drag.from);
      }
    }, 16);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.settling]);

  const down = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rects = ids.map((id) => rows.current[id]!.getBoundingClientRect());
    geo.current = {
      tops: rects.map((r) => r.top + window.scrollY),
      heights: rects.map((r) => r.height),
      startY: e.clientY + window.scrollY,
    };
    lastClientY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: ids[index]!, from: index, over: index, dy: 0, settling: false });
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.settling) return;
    lastClientY.current = e.clientY;
    update(drag.from);
  };
  const up = () => {
    if (!drag || drag.settling) return;
    const { from, over } = drag;
    const settleDy =
      slotTops(
        moved(
          ids.map((_, i) => i),
          from,
          over,
        ),
      )[from]! - geo.current.tops[from]!;
    setDrag({ ...drag, dy: settleDy, settling: true });
    setTimeout(() => {
      setDrag(null);
      if (over !== from) onReorder(moved(ids, from, over));
    }, 190);
  };

  // How far every other row slides while one is held.
  const shiftOf = (index: number) => {
    if (!drag) return 0;
    const order = moved(
      ids.map((_, i) => i),
      drag.from,
      drag.over,
    );
    return slotTops(order)[index]! - geo.current.tops[index]!;
  };

  return (
    <div className="flex flex-col" style={{ gap }} data-testid="sortable-list">
      {items.map((it, i) => {
        const held = drag?.id === it.id;
        const style: React.CSSProperties = {
          transform: !drag
            ? undefined
            : held
              ? `translateY(${drag.dy}px) scale(${drag.settling ? 1 : 1.03})`
              : `translateY(${shiftOf(i)}px)`,
          transition: !drag
            ? undefined
            : held
              ? drag.settling
                ? 'transform 180ms cubic-bezier(.2,.8,.3,1)'
                : 'none'
              : 'transform 200ms cubic-bezier(.2,.8,.3,1)',
          zIndex: held ? 30 : undefined,
          filter: held && !drag.settling ? 'drop-shadow(0 8px 0 rgba(16,22,40,.55))' : undefined,
        };
        return (
          <div
            key={it.id}
            ref={(el) => {
              rows.current[it.id] = el;
            }}
            data-testid={`sort-row-${it.id}`}
            className={`relative select-none ${drag ? '' : 'sort-wiggle'}`}
            style={{ ...style, animationDelay: `${(i % 3) * -0.17}s` }}
          >
            {render(it.id)}
            {/* the grip: only touching these squares moves the row; anywhere else the page scrolls as usual */}
            <div
              data-testid={`sort-grip-${it.id}`}
              aria-label="Drag to move"
              className={`absolute bottom-0 right-0 top-0 flex w-14 items-center justify-center text-onbg ${held ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => down(e, i)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <svg viewBox="0 0 6 9" width={18} height={27} shapeRendering="crispEdges" aria-hidden>
                {[0, 3, 6].flatMap((y) =>
                  [0, 3].map((x) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="currentColor" />
                  )),
                )}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
