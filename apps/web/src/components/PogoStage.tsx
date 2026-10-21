import { useEffect, useMemo, useRef, useState } from 'react';
import { playSfx } from '../lib/sfx';
import { audioLocked, unlockAudio } from '../lib/sound';
import sideData from '../assets/sprites/animation-side/pogo-side-animation.json';
import frontData from '../assets/sprites/animation/pogo-animation.json';
import wordmarkUrl from '../assets/sprites/brand/wordmark-die-o.svg';

type View = 'side' | 'front';
interface RawStep {
  frame: string;
  ms: number;
  x: number;
  y: number;
  fx: { name: string; x: number; y: number }[];
}
interface Step extends RawStep {
  view: View;
  sfx?: 'frogJump' | 'pogoHit';
  /** The step where he touches down on the stick. */
  landing?: boolean;
}

const urls = (glob: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(glob).map(([p, u]) => [p.split('/').pop()!.replace('.svg', ''), u]),
  );

// Frames are named "00-side_idle.svg"; fx "fx_dust.svg".
const SIDE_FRAMES = urls(
  import.meta.glob('../assets/sprites/animation-side/frames/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const FRONT_FRAMES = urls(
  import.meta.glob('../assets/sprites/animation/frames/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const FX = urls(
  import.meta.glob('../assets/sprites/animation/fx/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const frameUrl = (view: View, frame: string) => {
  const map = view === 'side' ? SIDE_FRAMES : FRONT_FRAMES;
  return map[Object.keys(map).find((k) => k.endsWith(frame) && k.replace(/^\d+-/, '') === frame)!];
};

/** Art-pixel size of each effect sprite (from the SVG viewBoxes). */
const FX_SIZE: Record<string, [number, number]> = {
  fx_boing: [40, 11],
  fx_dust: [32, 4],
  fx_trail: [9, 7],
};

type Anim = { sequences: Record<string, { steps: RawStep[] }> };
const side = sideData as unknown as Anim;
const front = frontData as unknown as Anim;

/** Side-view hops in from the left, jumps onto the stick (the landing is the front view), then the front-view bounce loops. */
function buildTimeline(): { intro: Step[]; loop: Step[] } {
  const tag = (view: View, steps: RawStep[]): Step[] =>
    steps.map((s, i) => ({
      ...s,
      view,
      // Every take-off croaks once (the first leap frame of a jump).
      sfx: s.frame === 'side_leap' && steps[i - 1]?.frame !== 'side_leap' ? 'frogJump' : undefined,
    }));
  const hop = tag('side', side.sequences.hop_in!.steps);
  const mount = tag('side', side.sequences.mount!.steps);
  // The last mount step is the landing on the stick: it switches to the front view.
  const landing: Step = { ...front.sequences.pogo_loop!.steps[0]!, view: 'front', sfx: 'pogoHit' };
  const loop = front.sequences.pogo_loop!.steps.map((s) => ({
    ...s,
    view: 'front' as const,
    sfx: s.frame === 'pogo_compress' ? ('pogoHit' as const) : undefined,
  }));
  return { intro: [...hop, ...mount.slice(0, -1), { ...landing, ms: 150, landing: true }], loop };
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The intro plays once per page load; coming back to the menu shows the frog already bouncing. */
let introPlayed = false;
export const introDone = () => introPlayed || reducedMotion();

/** Bounces after landing before he rests; after that he only jumps when tapped. */
const AUTO_BOUNCES = 3;
const REST: Step = { view: 'front', frame: 'pogo_extend', ms: 0, x: 0, y: 0, fx: [] };

/**
 * Opening animation stage: the stick stands alone, the toad hops in from the left, jumps on it and
 * bounces three times, then rests; tapping him makes him jump once (one sound). `onLanded` fires
 * when he lands (the wordmark and the menu come in then).
 */
export function PogoStage({ onLanded, scale }: { onLanded: () => void; scale: number }) {
  const { intro, loop } = useMemo(buildTimeline, []);
  const skip = introDone();
  const reduced = reducedMotion();
  const [step, setStep] = useState<Step>(skip ? REST : intro[0]!);
  const [tick, setTick] = useState(0);
  const [onIntro, setOnIntro] = useState(!skip);
  const busy = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const landedCb = useRef(onLanded);
  landedCb.current = onLanded;
  // Browsers refuse sound until the first tap, so a fresh visit waits for one ("tap to start")
  // and the whole intro, jump sounds included, is heard from the first hop.
  const [started, setStarted] = useState(() => skip || !audioLocked());
  useEffect(() => {
    if (started) return;
    const go = () => {
      unlockAudio();
      setStarted(true);
    };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [started]);

  /** Plays steps one after another, then calls `done`. */
  const run = (steps: Step[], done: () => void) => {
    let n = 0;
    const next = () => {
      const st = steps[n++];
      if (!st) return done();
      setStep(st);
      setTick((t) => t + 1);
      if (st.sfx) playSfx(st.sfx);
      if (st.landing) {
        introPlayed = true;
        setOnIntro(false);
        landedCb.current();
      }
      timer.current = setTimeout(next, st.ms);
    };
    next();
  };
  const rest = () => {
    setStep(REST);
    busy.current = false;
  };

  useEffect(() => {
    if (reduced || !started || skip) {
      busy.current = false;
      return;
    }
    run([...intro, ...Array.from({ length: AUTO_BOUNCES }, () => loop).flat()], rest);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const jump = () => {
    if (busy.current || reduced) return;
    busy.current = true;
    run(loop, rest);
  };

  const S = scale;
  const px = (n: number) => n * S;
  const box = 32 * S;
  const place = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: `calc(50% + ${px(x) - w / 2}px)`,
    bottom: px(-y),
    width: w,
    height: h,
    imageRendering: 'pixelated' as const,
  });

  return (
    <div
      className="relative mx-auto w-full overflow-hidden"
      style={{ height: px(32 + 16) }}
      data-testid="pogo-stage"
    >
      {/* the stick waits alone until he lands on it */}
      {onIntro && <img src={frameUrl('side', 'side_stick')} alt="" style={place(0, 0, box, box)} />}
      {(['side', 'front'] as const).flatMap((view) =>
        Object.keys(view === 'side' ? SIDE_FRAMES : FRONT_FRAMES).map((key) => {
          const frame = key.replace(/^\d+-/, '');
          const on = step.view === view && step.frame === frame;
          return (
            <img
              key={`${view}-${key}`}
              src={(view === 'side' ? SIDE_FRAMES : FRONT_FRAMES)[key]}
              alt=""
              style={{ ...place(step.x, step.y, box, box), visibility: on ? 'visible' : 'hidden' }}
            />
          );
        }),
      )}
      {!started && (
        <p className="label absolute inset-x-0 bottom-0 animate-pulse text-center text-onbg">
          Tap to start
        </p>
      )}
      {step.fx.map((fx, k) => {
        const [w, h] = FX_SIZE[fx.name] ?? [32, 4];
        return (
          <img
            key={`${tick}-${k}`}
            src={FX[fx.name]}
            alt=""
            style={place(fx.x, fx.y, px(w), px(h))}
          />
        );
      })}
      {/* tap the toad (or the stick) to make him jump once */}
      {!onIntro && (
        <button
          type="button"
          aria-label="Make the toad jump"
          data-testid="pogo-jump"
          onClick={jump}
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{ width: box, height: '100%' }}
        />
      )}
    </div>
  );
}

/** The POGO letters: pop in from nothing, then breathe (5% up and down). */
export function Wordmark({ shown, width }: { shown: boolean; width: number }) {
  return (
    <img
      src={wordmarkUrl}
      alt="POGO"
      data-testid="home-wordmark"
      className={`pointer-events-none relative z-10 ${shown ? 'wordmark-in' : 'opacity-0'}`}
      // Tilted 10 degrees, with clear space above the toad.
      style={{
        width,
        imageRendering: 'pixelated',
        transform: 'rotate(-10deg)',
        marginBottom: width * 0.1,
      }}
    />
  );
}
