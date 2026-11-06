import { useEffect, useRef, useState } from 'react';
import { HOP, SHADOW_APEX, SHADOW_BOX, frogUrl, jailChainsUrl, shadowUrl, sideDir } from './frog';
import type { FrogDir, FrogFrame } from './frog';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A player's frog on the board (19 x 19 art px, centred on `x`,`y`). When `pos` changes it plays one hop:
 * crouch, leap (travelling to the new space while it lifts, the shadow stays on the ground), crouch, sit. It faces
 * the way it is going, blinks now and then, and the board's own hop timing (STEP_MS) is one hop plus a breath.
 */
export function FrogToken({
  colour,
  pos,
  n,
  at,
  left,
  top,
  width,
  testId,
  jailed = false,
}: {
  colour: string;
  pos: number;
  n: number;
  /** The space's centre in art px (used to see which way the frog goes). */
  at: (pos: number) => { x: number; y: number };
  /** Where to stand (percent strings of the board). */
  left: string;
  top: string;
  width: string;
  testId: string;
  /** In jail: chained up with a padlock. */
  jailed?: boolean;
}) {
  const [frame, setFrame] = useState<FrogFrame>('sit');
  const [dir, setDir] = useState<FrogDir>(() => sideDir(pos, n));
  const prev = useRef(pos);
  const hopping = useRef(false);
  const body = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLImageElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    if (prev.current === pos) return;
    const a = at(prev.current);
    const b = at(pos);
    prev.current = pos;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    if (reduced()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    hopping.current = true;
    setFrame('crouch');
    later(HOP.crouchMs, () => {
      setFrame('leap');
      // lifted by the table of the hop; the shadow stays on the ground and, in step with the lift, gets smaller
      // and fainter towards the highest point and grows back as he comes down (one smooth curve, no switching)
      const el = body.current;
      const art = el ? el.getBoundingClientRect().width / 19 : 0;
      const top = Math.max(...HOP.lift);
      el?.animate(
        HOP.lift.map((px) => ({ transform: `translateY(${-px * art}px)` })),
        { duration: HOP.leapMs, easing: 'linear' },
      );
      shade.current?.animate(
        HOP.lift.map((px) => ({
          transform: `scale(${1 - (1 - SHADOW_APEX.scale) * (px / top)})`,
          opacity: 1 - (1 - SHADOW_APEX.opacity) * (px / top),
        })),
        { duration: HOP.leapMs, easing: 'linear' },
      );
    });
    later(HOP.crouchMs + HOP.leapMs, () => setFrame('crouch'));
    later(HOP.crouchMs + HOP.leapMs + HOP.landMs, () => setFrame('sit'));
    later(HOP.crouchMs + HOP.leapMs + HOP.landMs + HOP.sitMs, () => (hopping.current = false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Idle: blink for 120 ms every 2 to 4 seconds.
  useEffect(() => {
    if (reduced()) return;
    let t: ReturnType<typeof setTimeout>;
    const blink = () => {
      t = setTimeout(
        () => {
          if (!hopping.current) {
            setFrame('blink');
            setTimeout(() => !hopping.current && setFrame('sit'), 120);
          }
          blink();
        },
        2000 + Math.random() * 2000,
      );
    };
    blink();
    return () => clearTimeout(t);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <span
      data-testid={testId}
      data-at={pos}
      className="absolute"
      style={{
        left,
        top,
        width,
        aspectRatio: '1 / 1',
        transform: 'translate(-50%, -50%)',
        // It crouches first, then travels during the leap.
        transition: `left ${HOP.leapMs}ms linear ${HOP.crouchMs}ms, top ${HOP.leapMs}ms linear ${HOP.crouchMs}ms`,
      }}
    >
      <img
        ref={shade}
        src={shadowUrl}
        alt=""
        data-testid={`${testId}-shadow`}
        className="absolute block"
        style={{
          imageRendering: 'pixelated',
          left: `${(SHADOW_BOX.x / 19) * 100}%`,
          top: `${(SHADOW_BOX.y / 19) * 100}%`,
          width: `${(SHADOW_BOX.w / 19) * 100}%`,
          height: `${(SHADOW_BOX.h / 19) * 100}%`,
        }}
      />
      <img
        ref={body}
        src={frogUrl(colour, dir, frame)}
        alt=""
        className="absolute inset-0 block h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {jailed && (
        <img
          src={jailChainsUrl}
          alt=""
          data-testid={`${testId}-chains`}
          className="absolute inset-0 block h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </span>
  );
}
