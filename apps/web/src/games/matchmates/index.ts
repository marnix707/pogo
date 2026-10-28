import { createElement } from 'react';
import { matchmates } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/match-mates.svg';
import { allArt } from './art';
import { MatesOptions } from './LobbyOptions';
import { MatchMatesGame } from './MatchMatesGame';
import { MatchMatesRules } from './MatchMatesRules';

// Load the pictures once the app starts, so the arena is there the moment the game opens.
if (typeof Image !== 'undefined') for (const url of allArt()) new Image().src = url;

export const matchMatesUi: GameUi = {
  id: 'matchmates',
  name: 'Match Mates',
  emoji: '🐲',
  logo: logoUrl,
  tagline: 'Match tiles to power up your monsters and win the duel.',
  Component: MatchMatesGame,
  LobbyOptions: MatesOptions,
  Rules: ({ open, onClose }) => createElement(MatchMatesRules, { open, onClose }),
  hideScores: true,
  // Let the last move (swap, cascades, the final attack) play out before the standings.
  resultsDelayMs: (room) => {
    const e = (room.game?.view as matchmates.MatesView | undefined)?.lastEvent;
    return e
      ? matchmates.SWAP_MS +
          e.steps.length * matchmates.STEP_MS +
          e.fires.length * matchmates.FIRE_MS +
          700
      : 700;
  },
};
