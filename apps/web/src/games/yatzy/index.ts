import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/yatzy.svg';
import { YatzyGame } from './YatzyGame';

export const yatzyUi: GameUi = {
  id: 'yatzy',
  name: 'Yatzy',
  emoji: '🎲',
  logo: logoUrl,
  tagline: 'Roll five dice, chase combos, beat your friends.',
  Component: YatzyGame,
  ownHeader: true,
};
