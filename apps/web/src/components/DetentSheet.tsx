import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import grabberUrl from '../assets/sprites/ui/sheet-grabber.svg';
import { CloseIcon } from './icons';

/** The iOS-style easing of a sheet that settles (fast start, long soft landing). */
const SETTLE = 'transform 420ms cubic-bezier(0.32, 0.72, 0, 1)';
const SETTLE_MS = 420;
/** Height of the panel (the whole thing), as a fraction of the screen; half the screen is what shows at the half detent. */
const PANEL = 0.94;
const HALF = 0.5;

type Detent = 'half' | 'full';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A bottom sheet with two resting heights, like the ones on iOS: it swipes in to half the screen, drag
 * it up (by the grabber / title, or anywhere on it while it is at half) and it follows your finger and
 * settles on full height; drag it down and it settles back to half, or away if you push far enough or
 * flick it. The release uses the speed of the flick (it lands where it was heading), it resists a little
 * when pulled past the top, and the page behind fades with the sheet. At full height the content
 * scrolls; the header still drags the sheet.
 */
export function DetentSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [vh, setVh] = useState(() => window.innerHeight);
  const [detent, setDetent] = useState<Detent>('half');
  /** Panel offset down from its fully open place, px; null while it is not placed yet. */
  const [offset, setOffset] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    startY: number;
    startOffset: number;
    samples: { y: number; t: number }[];
  } | null>(null);
  const closing = useRef(false);

  const panelH = vh * PANEL;
  const halfOffset = panelH - vh * HALF;
  const closedOffset = panelH;
  const rest = (d: Detent) => (d === 'full' ? 0 : halfOffset);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Open: mount below the screen, then slide up to half in the next frame.
  useEffect(() => {
    if (open) {
      closing.current = false;
      setMounted(true);
      setDetent('half');
      setOffset(closedOffset);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOffset(halfOffset)));
      return () => cancelAnimationFrame(raf);
    }
    if (!mounted) return;
    setOffset(closedOffset);
    const t = setTimeout(() => setMounted(false), reducedMotion() ? 0 : SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep a resting sheet where it belongs when the screen size changes.
  useEffect(() => {
    if (open && !dragging && offset !== null && !closing.current) setOffset(rest(detent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    if (closing.current) return;
    closing.current = true;
    setOffset(closedOffset);
    // Let it slide away, then tell the owner (which unmounts us).
    setTimeout(onClose, reducedMotion() ? 0 : SETTLE_MS - 120);
  }

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    if (offset === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startOffset: offset,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    };
    setDragging(true);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    let next = d.startOffset + (e.clientY - d.startY);
    // Pulled past the top: it follows only a little (rubber band).
    if (next < 0) next = -Math.sqrt(-next) * 3;
    setOffset(Math.min(closedOffset, next));
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || offset === null) return;
    const first = d.samples[0];
    const lastSample = d.samples[d.samples.length - 1];
    const dt = first && lastSample ? Math.max(1, lastSample.t - first.t) : 1;
    const velocity = first && lastSample ? (lastSample.y - first.y) / dt : 0; // px per ms, + = down
    const moved = Math.abs(e.clientY - d.startY);
    // Where it was heading: the position plus a quarter second of the flick.
    const projected = Math.max(0, offset) + velocity * 250;
    const stops: [number, 'full' | 'half' | 'closed'][] = [
      [0, 'full'],
      [halfOffset, 'half'],
      [closedOffset, 'closed'],
    ];
    // A plain tap (no drag) on the grabber toggles between the two heights.
    if (moved < 6) {
      if ((e.currentTarget as HTMLElement).dataset.testid !== 'sheet-grabber') return;
      setDetent(detent === 'half' ? 'full' : 'half');
      setOffset(rest(detent === 'half' ? 'full' : 'half'));
      return;
    }
    // Pushing far below half closes: the "closed" stop only counts when it is clearly nearer than half.
    const best = stops.reduce((a, b) =>
      Math.abs(b[0] - projected) < Math.abs(a[0] - projected) ? b : a,
    );
    if (best[1] === 'closed') return close();
    setDetent(best[1]);
    setOffset(rest(best[1]));
  };

  if (!mounted) return null;
  const y = offset ?? closedOffset;
  const shown = Math.max(0, Math.min(1, 1 - Math.max(0, y) / closedOffset));
  const transition = dragging || reducedMotion() ? 'none' : SETTLE;
  const atHalf = detent === 'half';
  return (
    <div
      className="fixed inset-0 z-40 flex justify-center"
      data-testid="sheet-backdrop"
      style={{
        background: `rgba(0,0,0,${0.6 * shown})`,
        transition: dragging || reducedMotion() ? 'none' : 'background 420ms ease-out',
      }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-label={title}
        data-detent={detent}
        onClick={(e) => e.stopPropagation()}
        className="hud menu fixed bottom-0 flex w-full max-w-lg flex-col rounded-b-none !border-b-0 bg-panel px-5 shadow-xl"
        style={{
          height: `${panelH}px`,
          transform: `translateY(${y}px)`,
          transition,
          willChange: 'transform',
        }}
      >
        {/* The grabber and the title drag the sheet. */}
        <div
          className="-mx-5 touch-none select-none px-5 pb-3 pt-2"
          data-testid="sheet-grabber"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <img
            src={grabberUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="mx-auto mb-2 block h-3 w-10"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold uppercase tracking-[0.16em]">{title}</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-edge/50 text-neon"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* At half height the content cannot scroll: a drag anywhere moves the sheet up (like iOS). */}
        <div
          className={`min-h-0 flex-1 overflow-x-hidden ${atHalf ? 'touch-none overflow-y-hidden' : 'overflow-y-auto'}`}
          style={{ paddingBottom: `max(${y > 0 ? y : 0}px, env(safe-area-inset-bottom))` }}
          onPointerDown={atHalf ? onDown : undefined}
          onPointerMove={atHalf ? onMove : undefined}
          onPointerUp={atHalf ? onUp : undefined}
          onPointerCancel={atHalf ? onUp : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
