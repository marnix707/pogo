import { createElement } from 'react';
import { bankrupt } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/bankrupt.svg';
import { BankruptGame } from './BankruptGame';
import { frogUrl } from './frog';
import { screenArt } from './screenArt';
import { BankruptRules } from './BankruptRules';
import { BankruptOptionsPicker } from './LobbyOptions';

const frogBadge = (colour: string, testId: string) =>
  createElement('img', {
    src: frogUrl(colour, 'down', 'sit'),
    alt: colour,
    'data-testid': testId,
    className: 'h-9 w-9 shrink-0',
    style: { imageRendering: 'pixelated' },
  });

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
  // The top bar sits on a flat band over the screen's own dot pattern (see `--bk-art`, set by the screen).
  topBand: {
    backgroundColor: '#20325a',
    backgroundImage: `url("${screenArt('background/bg-pattern-18x18')}")`,
    backgroundSize: 'calc(var(--bk-art, 4px) * 18) calc(var(--bk-art, 4px) * 18)',
    backgroundAttachment: 'fixed',
    imageRendering: 'pixelated',
  },
  resultsDelayMs: () => 6500,
  // Everybody's frog colour: the one they picked in the lobby (the host is always red); else by their place.
  crewBadge: (index, choice) =>
    frogBadge(
      choice ?? bankrupt.PLAYER_COLOURS[index % bankrupt.PLAYER_COLOURS.length]!,
      `crew-frog-${index}`,
    ),
  choiceBadge: (choice) => frogBadge(choice, `frog-choice-${choice}`),
  scoreText: (score) => `$${score.toLocaleString('en-US')}`,
};
