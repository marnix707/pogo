import { BurnFire } from './BurnFire';
import { PlayingCard } from './PlayingCard';
type Card = number;

/**
 * Four of a kind burns the pile: dim the table, lay the four cards side by side in the middle,
 * then a fire pops up and everything fades away (all driven by CSS, see `four-*` in index.css).
 */
export function FourBurn({ cards, ms }: { cards: Card[]; ms: number }) {
  // Four cards plus gaps must fit the screen (5em wide each).
  const width = typeof window === 'undefined' ? 390 : Math.min(window.innerWidth, 512);
  const size = Math.min(16, (width - 32 - 3 * 8) / 20);
  return (
    <div
      data-testid="four-burn"
      className="four-burn pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/65"
      style={{ animationDuration: `${ms}ms` }}
      aria-hidden
    >
      <div className="flex gap-2">
        {cards.map((c, i) => (
          <span key={c} className="four-card" style={{ animationDelay: `${i * 110}ms` }}>
            <PlayingCard card={c} size={size} />
          </span>
        ))}
      </div>
      {/* The pixel flame grows out of the middle after the cards have landed and fades with the overlay. */}
      <BurnFire scale={9} delayMs={900} durationMs={Math.max(900, ms - 900)} />
    </div>
  );
}
