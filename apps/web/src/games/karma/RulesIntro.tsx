import { useEffect, useState } from 'react';
import { karma } from '@pogo/shared';

const IN_MS = 700;
const OUT_MS = 800;

const TITLE: Record<string, string> = { party: '🎉 Party rules:', epic: '🔥 Epic rules:' };

/**
 * Before anything moves (the card swap, the tutorial) the game sits dimmed behind this overlay: a
 * banner with the mode ("🎉 Party rules:") flies in from the top, the active rules fly in from the
 * left one after another, each with what it means; then the banner leaves upwards, the rules fly
 * out to the right and the brightness comes back. A tap skips it.
 */
export function RulesIntro({
  mode,
  rules,
  onDone,
}: {
  mode: karma.KarmaMode;
  rules: string[];
  onDone: () => void;
}) {
  const [stage, setStage] = useState<'enter' | 'in' | 'out'>('enter');
  const hold = 1400 + rules.length * 900;
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setStage('in')));
    const out = setTimeout(() => setStage('out'), IN_MS + hold);
    const done = setTimeout(onDone, IN_MS + hold + OUT_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(out);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flying =
    stage === 'in'
      ? 'translate-x-0'
      : stage === 'enter'
        ? '-translate-x-[130vw]'
        : 'translate-x-[130vw]';
  return (
    <div
      data-testid="rules-intro"
      data-stage={stage}
      onClick={() => setStage('out')}
      className="fixed inset-0 z-[75] flex flex-col items-center gap-6 px-5 pt-[calc(env(safe-area-inset-top)+4rem)]"
    >
      {/* the dimmed game: the brightness comes back when the overlay fades out */}
      <div
        className="absolute inset-0 bg-black/70 transition-opacity"
        style={{ opacity: stage === 'out' ? 0 : 1, transitionDuration: `${OUT_MS}ms` }}
      />
      <h2
        data-testid="rules-intro-title"
        className={`relative text-center text-3xl font-bold uppercase tracking-[0.1em] text-white transition-transform duration-500 ease-out ${
          stage === 'in' ? 'translate-y-0' : '-translate-y-[260%]'
        }`}
      >
        {TITLE[mode] ?? 'Rules:'}
      </h2>
      <ul className="relative flex w-full max-w-sm flex-col gap-3">
        {rules.map((id, i) => {
          const rule = karma.ruleById(id);
          if (!rule) return null;
          return (
            <li
              key={id}
              data-testid={`rules-intro-${id}`}
              className={`flex items-center gap-3 rounded-lg border-2 border-neon bg-panel2 px-3 py-3 text-ink transition-transform ease-out ${flying}`}
              style={{
                transitionDuration: '550ms',
                transitionDelay:
                  stage === 'in' ? `${200 + i * 200}ms` : stage === 'out' ? `${i * 120}ms` : '0ms',
              }}
            >
              <span className="text-4xl leading-none">{rule.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-tight">{rule.name}</span>
                <span className="block text-sm leading-snug text-muted">{rule.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
