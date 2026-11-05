import { createElement } from 'react';
import { bankrupt } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/bankrupt.svg';
import { BankruptGame } from './BankruptGame';
import { frogUrl } from './frog';
import { BankruptRules } from './BankruptRules';
import { BankruptOptionsPicker } from './LobbyOptions';

export const bankruptUi: GameUi = {
  id: 'bankrupt',
  name: 'Bankrupt',
  emoji: '🏦',
  logo: logoUrl,
  tagline: 'Buy the city, build, and bankrupt your friends.',
  Component: BankruptGame,
  LobbyOptions: BankruptOptionsPicker,
  Rules: ({ open, onClose }) => createElement(BankruptRules, { open, onClose }),
  // The walk and payments of the last move play, then a banner says why it ended, then the results.
  resultsDelayMs: () => 6500,
  // Everybody's frog colour is by their place in the crew list: the host red, the second blue, and so on.
  crewBadge: (index) =>
    createElement('img', {
      src: frogUrl(bankrupt.PLAYER_COLOURS[index % bankrupt.PLAYER_COLOURS.length]!, 'down', 'sit'),
      alt: '',
      'data-testid': `crew-frog-${index}`,
      className: 'h-9 w-9 shrink-0',
      style: { imageRendering: 'pixelated' },
    }),
  scoreText: (score) => `$${score.toLocaleString('en-US')}`,
};
