import type { GameUi } from '../types';
import { YatzyGame } from './YatzyGame';

export const yatzyUi: GameUi = {
  id: 'yatzy',
  name: 'Yatzy',
  emoji: '🎲',
  tagline: 'Roll five dice, chase combos, beat your friends.',
  Component: YatzyGame,
  ownHeader: true,
};
