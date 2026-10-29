import { matchmates } from '@pogo/shared';
import { Sheet } from '../../components/ui';

const { STAGE_SPECS, STAGES, ELEMENTS, MONSTERS } = matchmates;

export function MatchMatesRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Pet Match">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> bring your opponent&apos;s hit points to zero. The host
          picks the starting HP in the lobby (100 by default).
        </li>
        <li>
          <b className="text-neon">Pick:</b> take turns choosing pets (the first player one, the
          second player two, the first player the last one: every pet is different), then name an
          arena (or Random). A coin flip decides whose arena is used:{' '}
          <b>the winner of the coin plays second, with 5 extra hit points</b>.
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
          <b className="text-neon">Combos:</b> every match of <b>4</b> gives you an extra move, a
          match of <b>5 or more</b> also heals you 5 and a match of <b>6 or more</b> also hits for
          5. Lines that cross (an L or a T) count together, so six tiles in a corner count as six.
        </li>
        <li>
          <b className="text-neon">Berries:</b> match berries to collect them. You can hold 4 (3 in
          Forest Valley), which is what it costs to <b>Evolve</b> a monster into a stronger one (one
          move) or to <b>Boost</b> an evolved monster with as much mana (one move). Tap one of your
          monsters to do either.
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
