import { useEffect, useRef, useState } from 'react';
import {
  HOP,
  MEGA,
  SHADOW_APEX,
  SHADOW_BOX,
  frogUrl,
  jailChainsUrl,
  shadowUrl,
  sideDir,
} from './frog';
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
  mega = 0,
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
  /** Counts up whenever a card sends this frog somewhere: it jumps up off the screen and crash-lands instead of hopping. */
  mega?: number;
}) {
  const [frame, setFrame] = useState<FrogFrame>('sit');
  const [dir, setDir] = useState<FrogDir>(() => sideDir(pos, n));
  const prev = useRef(pos);
  // mega jump: while it is up and away the frog keeps its old place, then it appears at the new one from above
  const megaSeen = useRef(mega);
  const [kept, setKept] = useState<{ left: string; top: string } | null>(null);
  const [snap, setSnap] = useState(false); // (no gliding while it is moved unseen)
  const [dust, setDust] = useState(0);
  const lastPlace = useRef({ left, top });
  // (read while rendering: the place it stood at before the card moved it, so it never shows at the new one early)
  const megaPending = mega !== megaSeen.current;
  const place = kept ?? (megaPending ? lastPlace.current : { left, top });
  if (!kept && !megaPending) lastPlace.current = { left, top };
  const hopping = useRef(false);
  const body = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLImageElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    if (megaSeen.current !== mega) {
      // A card sent the frog: a MEGA jump (no hops on the way)
      megaSeen.current = mega;
      prev.current = pos;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const el = body.current;
      const art = el ? el.getBoundingClientRect().width / 19 : 1;
      const rise = (el ? el.getBoundingClientRect().bottom : 400) + 60; // css px up and out of the screen
      setKept(lastPlace.current);
      setFrame('leap');
      hopping.current = true;
      el?.animate(
        [
          { transform: 'translateY(0) scaleY(0.8)', offset: 0 },
          { transform: `translateY(${-6 * art}px) scaleY(1.1)`, offset: 0.18 },
          { transform: `translateY(${-rise}px) scaleY(1.25)` },
        ],
        { duration: MEGA.upMs, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' },
      );
      shade.current?.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.4)' },
        ],
        { duration: MEGA.upMs, fill: 'forwards' },
      );
      later(MEGA.upMs + MEGA.hiddenMs, () => {
        // unseen: move to the new space, then drop in from above
        setSnap(true);
        setKept(null);
        const e2 = body.current;
        const rise2 = (e2 ? e2.getBoundingClientRect().bottom : 400) + 900;
        e2?.animate(
          [
            { transform: `translateY(${-rise2}px) scaleY(1.25)` },
            { transform: 'translateY(0) scaleY(1)' },
          ],
          { duration: MEGA.dropMs, easing: 'cubic-bezier(0.55, 0, 1, 0.8)', fill: 'forwards' },
        );
        shade.current?.animate(
          [
            { opacity: 0, transform: 'scale(0.4)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
          { duration: MEGA.dropMs, easing: 'ease-in', fill: 'forwards' },
        );
        later(MEGA.dropMs, () => {
          // crash: squashed, a puff of dust, then it sits up
          setFrame('crouch');
          setDust((d) => d + 1);
          setSnap(false);
          body.current?.getAnimations().forEach((x) => x.cancel());
          shade.current?.getAnimations().forEach((x) => x.cancel());
          later(130, () => setFrame('sit'));
          later(MEGA.dustMs, () => (hopping.current = false));
        });
      });
      return;
    }
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
  }, [pos, mega]);

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
        left: place.left,
        top: place.top,
        width,
        aspectRatio: '1 / 1',
        transform: 'translate(-50%, -50%)',
        // It crouches first, then travels during the leap.
        transition: snap
          ? 'none'
          : `left ${HOP.leapMs}ms linear ${HOP.crouchMs}ms, top ${HOP.leapMs}ms linear ${HOP.crouchMs}ms`,
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
      {dust > 0 && (
        <span
          key={dust}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          data-testid={`${testId}-dust`}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const side = i % 2 ? 1 : -1;
            return (
              <span
                key={i}
                className="bk-dust absolute bg-[#f7f1e4]"
                style={{
                  left: '50%',
                  top: '84%',
                  width: '9%',
                  height: '9%',
                  ['--dx' as string]: `${side * (60 + (i >> 1) * 38)}%`,
                  ['--dy' as string]: `${-(18 + ((i * 37) % 5) * 9)}%`,
                  animationDelay: `${(i >> 1) * 20}ms`,
                }}
              />
            );
          })}
        </span>
      )}
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
