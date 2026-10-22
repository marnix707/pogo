/**
 * Game modes and the catalogue of extra rules.
 *
 * - normal: the base rules only.
 * - party: from round 2 on, the winner of the last game sets the rules (before the cards are dealt);
 *   the rules that are on apply to that game and carry over to the next.
 * - epic: every rule in the catalogue is on from the first game.
 *
 * To add a rule: add an entry to KARMA_RULES and give it an effect in game.ts (look for `hasRule`).
 */
export type KarmaMode = 'normal' | 'party' | 'epic';

export const KARMA_MODES: { id: KarmaMode; name: string; emoji: string; blurb: string }[] = [
  { id: 'normal', name: 'Normal', emoji: '🃏', blurb: 'The classic rules.' },
  {
    id: 'party',
    name: 'Party',
    emoji: '🎉',
    blurb: 'From round 2 the winner of the last game switches the extra rules on or off.',
  },
  {
    id: 'epic',
    name: 'Epic',
    emoji: '🔥',
    blurb: 'Every extra rule is on from the start. Tap a rule below to see what it does.',
  },
];

export interface KarmaRule {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const KARMA_RULES: readonly KarmaRule[] = [
  {
    id: 'bigHand',
    name: 'Big hand',
    emoji: '🖐️',
    description: 'Everybody holds four cards in their hand instead of three.',
  },
  {
    id: 'echoThree',
    name: '3 ate 8',
    emoji: '3️⃣',
    description: 'A 3 repeats the card beneath it: a 3 on an 8 skips the next player again.',
  },
  {
    id: 'fastReload',
    name: 'Fast reload',
    emoji: '⚡',
    description:
      'Draw a card of the rank you just played? Play it too, before the next turn. Press Skip to pass.',
  },
];

export const ruleById = (id: string): KarmaRule | undefined => KARMA_RULES.find((r) => r.id === id);

export const hasRule = (rules: readonly string[] | undefined, id: string): boolean =>
  !!rules && rules.includes(id);
