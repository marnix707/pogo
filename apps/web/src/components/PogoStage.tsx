import { useEffect, useMemo, useState } from 'react';
import { playSfx } from '../lib/sfx';
import { audioLocked, unlockAudio } from '../lib/sound';
import sideData from '../assets/sprites/animation-side/pogo-side-animation.json';
import frontData from '../assets/sprites/animation/pogo-animation.json';
import wordmarkUrl from '../assets/sprites/brand/wordmark-yellow.svg';

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
  return { intro: [...hop, ...mount.slice(0, -1), { ...landing, ms: 150 }], loop };
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The intro plays once per page load; coming back to the menu shows the frog already bouncing. */
let introPlayed = false;
export const introDone = () => introPlayed || reducedMotion();

/**
 * Opening animation stage: the stick stands alone, Pogo hops in from the left, jumps on it and
 * bounces. `onLanded` fires at the moment he lands (the wordmark and the menu come in then).
 */
export function PogoStage({ onLanded, scale }: { onLanded: () => void; scale: number }) {
  const { intro, loop } = useMemo(buildTimeline, []);
  const skip = introDone();
  const [i, setI] = useState(skip ? intro.length : 0);
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

  useEffect(() => {
    if (reducedMotion() || !started) return;
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    let n = skip ? intro.length : 0;
    const tick = () => {
      if (cancelled) return;
      const step = n < intro.length ? intro[n]! : loop[(n - intro.length) % loop.length]!;
      setI(n);
      if (step.sfx) playSfx(step.sfx);
      if (n === intro.length - 1 && !skip) {
        introPlayed = true;
        onLanded();
      }
      n++;
      t = setTimeout(tick, step.ms);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const step: Step = reducedMotion()
    ? { view: 'front', frame: 'pogo_extend', ms: 0, x: 0, y: 0, fx: [] }
    : i < intro.length
      ? intro[i]!
      : loop[(i - intro.length) % loop.length]!;
  const inIntro = i < intro.length && !reducedMotion();

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
      aria-hidden
      data-testid="pogo-stage"
    >
      {/* the stick waits alone until he lands on it */}
      {inIntro && <img src={frameUrl('side', 'side_stick')} alt="" style={place(0, 0, box, box)} />}
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
          <img key={`${i}-${k}`} src={FX[fx.name]} alt="" style={place(fx.x, fx.y, px(w), px(h))} />
        );
      })}
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
      className={shown ? 'wordmark-in' : 'opacity-0'}
      style={{ width, imageRendering: 'pixelated' }}
    />
  );
}
