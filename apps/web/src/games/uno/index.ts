import { createElement } from 'react';
import type { GameUi } from '../types';
import { UnoGame } from './UnoGame';
import { UnoRules } from './UnoRules';

export const unoUi: GameUi = {
  id: 'uno',
  name: 'UNO',
  emoji: '🎴',
  tagline: 'Match colours and numbers. Press UNO! on your last card.',
  Component: UnoGame,
  Rules: ({ open, onClose }) => createElement(UnoRules, { open, onClose }),
  hideScores: true, // the standings are ranked by what is left in the hand
  // Let the last card land before the standings cover the table.
  resultsDelayMs: () => 1100,
};
