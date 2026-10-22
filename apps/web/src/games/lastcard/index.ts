import { createElement } from 'react';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/last-card.svg';
import { LastCardGame } from './LastCardGame';
import { LastCardRules } from './LastCardRules';

export const lastCardUi: GameUi = {
  id: 'lastcard',
  name: 'Last Card',
  emoji: '🎴',
  logo: logoUrl,
  tagline: 'Match colours and numbers. Press UNO! on your last card.',
  Component: LastCardGame,
  Rules: ({ open, onClose }) => createElement(LastCardRules, { open, onClose }),
  hideScores: true, // the standings are ranked by what is left in the hand
  // Let the last card land before the standings cover the table.
  resultsDelayMs: () => 1100,
};
