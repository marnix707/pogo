/**
 * Game modes and the catalogue of extra rules.
 *
 * - normal: the base rules only.
 * - party: every time a game ends, its winner picks one of four rules (offered from the catalogue,
 *   never one that is already on); the chosen rules apply to every next game in the room.
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
    blurb: 'The winner of each game picks a new rule for all next games.',
  },
  { id: 'epic', name: 'Epic', emoji: '🔥', blurb: 'Every extra rule is on from the start.' },
];

export interface KarmaRule {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const KARMA_RULES: readonly KarmaRule[] = [
  {
    id: 'jacksSkip',
    name: 'Jacks skip',
    emoji: '🦘',
    description: 'A jack skips the next player, just like an 8.',
  },
  {
    id: 'tripleBurn',
    name: 'Triple burn',
    emoji: '🧨',
    description: 'Three of a kind on top of the pile burns it.',
  },
  {
    id: 'aceBurn',
    name: 'Ace burns',
    emoji: '🅰️',
    description: 'An ace burns the pile, like a 10.',
  },
  {
    id: 'sixesWild',
    name: 'Wild sixes',
    emoji: '🎲',
    description: 'A 6 goes on anything, and anything goes on a 6.',
  },
  {
    id: 'bigHand',
    name: 'Big hand',
    emoji: '🖐️',
    description: 'Everybody holds four cards in their hand instead of three.',
  },
];

/** How many rules the winner chooses from in party mode. */
export const PICK_CHOICES = 4;

export const ruleById = (id: string): KarmaRule | undefined => KARMA_RULES.find((r) => r.id === id);

export const hasRule = (rules: readonly string[] | undefined, id: string): boolean =>
  !!rules && rules.includes(id);
