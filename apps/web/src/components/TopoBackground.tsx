import { useEffect, useRef } from 'react';
import { makeNoise, topoFrame } from '../lib/topo';

const FRAME_MS = 1000 / 24;
/** Dark felt lines: thin ones, and heavier index lines (like the contour lines of a map). */
const MINOR = 'rgba(4, 34, 26, 0.34)';
const MAJOR = 'rgba(4, 34, 26, 0.55)';

/**
 * The table's contour-line background: thin map lines that slowly drift, morph and breathe in and
 * out. A fixed canvas behind everything; it never takes a tap, pauses while the tab is hidden and
 * is drawn once (still) with reduced motion.
 */
export function TopoBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const noise = makeNoise(11);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const paint = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      const minor = new Path2D();
      const major = new Path2D();
      topoFrame(
        noise,
        w,
        h,
        t,
        (a, b, c, d) => (minor.moveTo(a, b), minor.lineTo(c, d)),
        (a, b, c, d) => (major.moveTo(a, b), major.lineTo(c, d)),
      );
      ctx.strokeStyle = MINOR;
      ctx.lineWidth = 1;
      ctx.stroke(minor);
      ctx.strokeStyle = MAJOR;
      ctx.lineWidth = 1.6;
      ctx.stroke(major);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      paint(now / 1000);
    };
    const start = () => {
      if (!still && !raf) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onResize = () => {
      size();
      paint(performance.now() / 1000);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    size();
    paint(still ? 12 : performance.now() / 1000);
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="topo-background"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: -1 }}
    />
  );
}

