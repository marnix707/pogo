import type { GameUi } from '../types';
import { KarmaGame } from './KarmaGame';

export const karmaUi: GameUi = {
  id: 'karma',
  name: 'Karma',
  emoji: '🃏',
  tagline: 'Shed all your cards. Don’t be the last one left.',
  Component: KarmaGame,
  hideScores: true, // the score is only a rank in Karma
  resultsTitle(room, me) {
    const results = room.game?.results?.rankings;
    const last = results?.[results.length - 1];
    if (!last) return undefined;
    if (last.playerId === me) return '😬 Karma got you!';
    const name = room.members.find((m) => m.id === last.playerId)?.nickname ?? 'Someone';
    return `😬 ${name} is last`;
  },
};
