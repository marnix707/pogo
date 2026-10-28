import { matchmates } from '@pogo/shared';
import { Sheet } from '../../components/ui';

const { STAGE_SPECS, STAGES, ELEMENTS, MONSTERS } = matchmates;

export function MatchMatesRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Pet Match">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> bring your opponent&apos;s hit points to zero. The
          player who goes second starts with 5 extra hit points. The host picks the starting HP in
          the lobby (100 by default).
        </li>
        <li>
          <b className="text-neon">Pick:</b> choose two monsters (two different elements) and a
          stage. If you and your opponent choose different stages, one of them is picked at random.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> you have <b>2 moves</b>. Swap two neighbouring
          tiles (tap one, then the other, or slide it). Tiles that line up 3 or more fall away and
          new ones drop in; chains keep counting. You may swap anything, but a swap that matches
          nothing just <b>wastes that move</b>.
        </li>
        <li>
          <b className="text-neon">Mana:</b> matched tiles fly to the mana bar of <i>your own</i>{' '}
          monster of that element, never your opponent&apos;s. A full bar fires the monster&apos;s
          special attack by itself:
          <ul className="mt-1 flex flex-col gap-1">
            {ELEMENTS.map((e) => (
              <li key={e}>
                <b>{MONSTERS[e].names[0]}</b> ({MONSTERS[e].damage[0]} damage, evolved{' '}
                {MONSTERS[e].damage[1]}): {MONSTERS[e].ability}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <b className="text-neon">Combos:</b> every line of <b>4</b> gives you an extra move, a
          line of <b>5 or more</b> also heals you 5 and a line of <b>6 or more</b> also hits for 5.
        </li>
        <li>
          <b className="text-neon">Berries:</b> match berries to collect them. Spend 4 on{' '}
          <b>Evolve</b> for a stronger monster (it costs one move), or 4 on <b>Boost</b> to give an
          evolved monster 4 mana (one move).
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
