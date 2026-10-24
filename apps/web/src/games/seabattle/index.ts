import { createElement } from 'react';
import { seabattle } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/sea-battle.svg';
import { allArt } from './art';
import { SeaBattleGame, RADAR_DELAY_MS, RADAR_MS } from './SeaBattleGame';
import { SeaBattleRules } from './SeaBattleRules';

// Load the pictures once the app starts, so the sea is there the moment the game opens.
if (typeof Image !== 'undefined') for (const url of allArt()) new Image().src = url;

export const seaBattleUi: GameUi = {
  id: 'seabattle',
  name: 'Sea Battle',
  emoji: '🚢',
  logo: logoUrl,
  tagline: 'Hide your fleet, find theirs. Sink every ship.',
  Component: SeaBattleGame,
  Rules: ({ open, onClose }) => createElement(SeaBattleRules, { open, onClose }),
  hideScores: true,
  // The last bomb, the radar that shows the ships nobody found, and a beat before the standings.
  resultsDelayMs: () => Math.max(RADAR_DELAY_MS, seabattle.SHOT_FX_MS) + RADAR_MS + 1400,
};
