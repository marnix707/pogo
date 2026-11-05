import { createElement } from 'react';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/bankrupt.svg';
import { BankruptGame } from './BankruptGame';
import { BankruptRules } from './BankruptRules';
import { BankruptOptionsPicker } from './LobbyOptions';

export const bankruptUi: GameUi = {
  id: 'bankrupt',
  name: 'Bankrupt!',
  emoji: '🏦',
  logo: logoUrl,
  tagline: 'Buy the city, build, and bankrupt your friends.',
  Component: BankruptGame,
  LobbyOptions: BankruptOptionsPicker,
  Rules: ({ open, onClose }) => createElement(BankruptRules, { open, onClose }),
  // The walk and payments of the last move play, then a banner says why it ended, then the results.
  resultsDelayMs: () => 6500,
  scoreText: (score) => `$${score.toLocaleString('en-US')}`,
};
