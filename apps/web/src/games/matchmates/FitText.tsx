import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { fitInto } from './fitText';

/**
 * Says something at a spot (x, y in % of its parent) without ever leaving the screen: after it is drawn it is
 * measured against `bounds` (the screen of the game) and moved back inside, or wrapped when it is wider than the
 * screen (see `fitInto`). The animation lives on the inner element, so it never fights the placement.
 */
export function FitText({
  x,
  y,
  bounds,
  className = '',
  style,
  children,
  testId,
}: {
  x: number;
  y: number;
  bounds: RefObject<HTMLElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ dx: 0, dy: 0, wrap: false });
  useLayoutEffect(() => {
    const el = box.current;
    const area = bounds.current;
    if (!el || !area) return;
    // Measure where it would sit without any correction.
    const prev = { dx: fit.dx, dy: fit.dy };
    const r = el.getBoundingClientRect();
    const b = area.getBoundingClientRect();
    const raw = {
      left: r.left - prev.dx,
      right: r.right - prev.dx,
      top: r.top - prev.dy,
      bottom: r.bottom - prev.dy,
    };
    const f = fitInto(raw, b);
    if (f.tooWide && !fit.wrap) return setFit({ dx: 0, dy: 0, wrap: true });
    if (f.dx !== prev.dx || f.dy !== prev.dy) setFit({ dx: f.dx, dy: f.dy, wrap: fit.wrap });
  }, [x, y, children, bounds, fit]);
  return (
    <div
      ref={box}
      data-testid={testId}
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        marginLeft: fit.dx,
        marginTop: fit.dy,
        width: 'max-content',
        maxWidth: fit.wrap ? '90%' : undefined,
      }}
    >
      <span className={`block ${className}`} style={style}>
        {children}
      </span>
    </div>
  );
}
