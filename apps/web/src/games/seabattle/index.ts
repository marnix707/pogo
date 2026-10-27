import { createElement } from 'react';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/sea-battle.svg';
import { allArt } from './art';
import type { seabattle } from '@pogo/shared';
import { SeaBattleGame, END_MS, RADAR_END_MS } from './SeaBattleGame';
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
  // The loser's radar (the view carries the ships nobody found) plays out completely and stays a moment;
  // the winner has nothing to find and goes to the standings after the last ship has sunk.
  resultsDelayMs: (room) =>
    ((room.game?.view as seabattle.SeaBattleView | undefined)?.revealed?.length ?? 0) > 0
      ? RADAR_END_MS
      : END_MS,
};
