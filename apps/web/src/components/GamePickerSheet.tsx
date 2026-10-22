import { gameUis } from '../games/registry';
import { Sheet } from './ui';

/**
 * The host picks the next game without anybody leaving the room (a persistent lobby: a group of friends
 * cycles through games quickly). Everybody stays; the lobby simply becomes the lobby of the new game.
 */
export function GamePickerSheet({
  open,
  onClose,
  currentId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onPick: (gameId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a game">
      <p className="mb-3 text-sm opacity-80">Everybody stays in the lobby.</p>
      <div
        className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1"
        data-testid="game-picker"
      >
        {gameUis.map((g) => (
          <button
            key={g.id}
            type="button"
            data-testid={`pick-game-${g.id}`}
            aria-pressed={g.id === currentId}
            onClick={() => {
              onClose();
              if (g.id !== currentId) onPick(g.id);
            }}
            className={`hud flex w-full items-center gap-3 p-3 text-left ${g.id === currentId ? 'ring-2 ring-neon' : ''}`}
          >
            {g.logo ? (
              <img
                src={g.logo}
                alt=""
                aria-hidden
                className="h-14 w-20 shrink-0 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center text-3xl"
                aria-hidden
              >
                {g.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold uppercase tracking-[0.1em]">{g.name}</span>
              <span className="block text-xs leading-snug opacity-80">{g.tagline}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
