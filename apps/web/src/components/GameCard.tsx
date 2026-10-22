import { forwardRef } from 'react';
import type { GameUi } from '../games/types';

/**
 * The game button of the Play screen, and (the very same card) the top of the lobby: tapping a game
 * on the Play screen morphs this card to the top of the lobby (lib/cardMorph.ts), and tapping it there
 * (host) opens the list of games again.
 */
export const GameCard = forwardRef<
  HTMLElement,
  {
    ui: GameUi;
    /** Without `onClick` the card is plain (a guest in a lobby cannot change the game). */
    onClick?: () => void;
    disabled?: boolean;
    /** A small ▾ / ▴ in the corner: this card opens / closes the game list. */
    chevron?: 'down' | 'up';
    /** Greyed out (still tappable, so the caller can say why it cannot be chosen). */
    dim?: boolean;
    className?: string;
    'data-testid'?: string;
  }
>(function GameCard({ ui, onClick, disabled, chevron, dim, className = '', ...rest }, ref) {
  const body = (
    <>
      {ui.logo ? (
        <img
          src={ui.logo}
          alt=""
          aria-hidden
          className="h-16 w-24 shrink-0 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-accent text-4xl"
          aria-hidden
        >
          {ui.emoji}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold uppercase tracking-[0.12em]">{ui.name}</span>
        <span className="block text-sm leading-snug text-muted">{ui.tagline}</span>
      </span>
      {chevron && (
        <span
          aria-hidden
          data-testid="game-card-chevron"
          className="absolute right-3 top-1 text-xs opacity-60"
        >
          {chevron === 'down' ? '▾' : '▴'}
        </span>
      )}
    </>
  );
  const classes = `hud hud-ticks relative flex w-full items-center gap-4 bg-panel p-4 text-left text-ink ${dim ? 'opacity-40 grayscale' : ''} ${className}`;
  return onClick ? (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      aria-disabled={dim || undefined}
      onClick={onClick}
      className={`${classes} transition active:scale-[0.99] disabled:opacity-50`}
      {...rest}
    >
      {body}
    </button>
  ) : (
    <div ref={ref as React.Ref<HTMLDivElement>} className={classes} {...rest}>
      {body}
    </div>
  );
});
