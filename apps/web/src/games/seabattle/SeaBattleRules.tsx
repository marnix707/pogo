import { Sheet } from '../../components/ui';

export function SeaBattleRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Sea Battle">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> sink all five enemy ships before they sink yours.
        </li>
        <li>
          <b className="text-neon">Your fleet:</b> a carrier (5 squares), battleship (4), cruiser
          (3), submarine (3) and destroyer (2). <b>Drag</b> a ship to move it, <b>tap</b> it to turn
          it, or press <b>Random</b> for a new layout. Ships may touch but not overlap. Press{' '}
          <b>Play</b> when you are happy.
        </li>
        <li>
          <b className="text-neon">Who starts?</b> A coin with the players&apos; pictures is tossed.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> tap a square on the enemy sea: that is your shot.
          Each shot is a hit, a miss, or sinks a ship when every square of it is hit.{' '}
          <b>A hit lets you shoot again</b>; a miss passes the turn. You are told when a ship goes
          down, never which one is where.
        </li>
        <li>
          <b className="text-neon">The end:</b> the first to sink the whole enemy fleet wins. A
          radar then shows where the last hidden ships were.
        </li>
      </ul>
    </Sheet>
  );
}
