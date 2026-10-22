import { useEffect, useState } from 'react';

/** How long the cowboy stays (ms), then it is gone. */
const SHOT_MS = 1300;

/**
 * A fast reload: a cowboy pulls his pistol and fires: PEW! The gun kicks back, a muzzle flash pops and the
 * cowboy slides in and out. `trigger` changes (to a non-zero number) for every reload; the pistol sound is
 * played by the caller.
 */
export function ReloadShot({ trigger, name }: { trigger: number; name: string }) {
  const [shot, setShot] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    setShot(trigger);
    const t = setTimeout(() => setShot(0), SHOT_MS);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!shot) return null;
  return (
    <div
      key={shot}
      aria-hidden
      data-testid="reload-shot"
      className="reload-shot pointer-events-none fixed inset-x-0 top-[26%] z-40 flex justify-center"
    >
      <div className="relative flex items-end gap-1">
        <span className="shot-cowboy text-7xl leading-none drop-shadow-[0_4px_0_#101628]">🤠</span>
        <span
          className="shot-gun -ml-3 inline-block text-5xl leading-none drop-shadow-[0_3px_0_#101628]"
          style={{ transform: 'scaleX(-1)' }}
        >
          🔫
        </span>
        <span className="shot-flash absolute -right-8 top-3 text-5xl leading-none">💥</span>
        <span
          className="shot-pew absolute -right-24 -top-4 whitespace-nowrap font-bold uppercase leading-none text-white"
          style={{
            fontSize: 30,
            textShadow:
              '0.04em 0 0 #fff, 0 0.06em 0 #d9382f, 0.08em 0.1em 0 #101628, 0 0.18em 0.14em rgb(0 0 0 / 0.45)',
          }}
        >
          Pew!
        </span>
        <span className="label absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-onbg">
          {name} reloads!
        </span>
      </div>
    </div>
  );
}
