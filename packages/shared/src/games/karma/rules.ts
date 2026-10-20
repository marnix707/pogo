/**
 * Game modes and the catalogue of extra rules.
 *
 * - normal: the base rules only.
 * - party: every time a game ends, its winner switches one extra rule on or off; the rules that
 *   are on apply to every next game in the room.
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
    blurb: 'After each game the winner switches an extra rule on or off for all next games.',
  },
  { id: 'epic', name: 'Epic', emoji: '🔥', blurb: 'Every extra rule is on from the start of every game:' },
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
    name: '3 ate 9',
    emoji: '3️⃣',
    description: 'A 3 repeats the card beneath it: a 3 on an 8 skips the next player again.',
  },
];

export const ruleById = (id: string): KarmaRule | undefined => KARMA_RULES.find((r) => r.id === id);

export const hasRule = (rules: readonly string[] | undefined, id: string): boolean =>
  !!rules && rules.includes(id);
