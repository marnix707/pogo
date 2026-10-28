import { matchmates } from '@pogo/shared';
import { Sheet } from '../../components/ui';

const { STAGE_SPECS, STAGES } = matchmates;

export function MatchMatesRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Match Mates">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> bring your opponent&apos;s hit points to zero. The
          player who goes second starts with 5 extra hit points.
        </li>
        <li>
          <b className="text-neon">Pick:</b> choose two monsters (two different elements) and a
          stage. If you and your opponent choose different stages, one of them is picked at random.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> you have <b>2 moves</b>. Swap two neighbouring
          tiles (tap one, then the other, or slide it) so that 3 or more of a kind line up. Tiles
          fall and new ones drop in; chains keep counting.
        </li>
        <li>
          <b className="text-neon">Mana:</b> matched tiles fill the mana bar of <i>your own</i>{' '}
          monster of that element, never your opponent&apos;s. A full bar fires the monster&apos;s
          special attack by itself.
        </li>
        <li>
          <b className="text-neon">Extra move:</b> a line of 4 or more gives you one extra move
          (once per turn). With <b>Match bonus</b> on, every 4+ line gives one, a line of 5 also
          heals 5 and a line of 6 or more also hits for 5.
        </li>
        <li>
          <b className="text-neon">Berries:</b> match berries to collect them. Spend 4 on{' '}
          <b>Evolve</b> (one move) for a stronger monster, or 4 on <b>Boost</b> to give an evolved
          monster 4 mana (one move).
        </li>
        <li>
          <b className="text-neon">Stages:</b>
          <ul className="mt-1 flex flex-col gap-1">
            {STAGES.map((s) => (
              <li key={s}>
                <b>{STAGE_SPECS[s].name}:</b> {STAGE_SPECS[s].rule}
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </Sheet>
  );
}
