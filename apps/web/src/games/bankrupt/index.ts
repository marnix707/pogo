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
  scoreText: (score) => `$${score.toLocaleString('en-US')}`,
};
