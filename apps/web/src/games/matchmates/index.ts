import { createElement } from 'react';
import { matchmates } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/match-mates.svg';
import { END_DROP_MS, allArt } from './art';
import { MatesOptions } from './LobbyOptions';
import { MatchMatesGame } from './MatchMatesGame';
import { MatchMatesRules } from './MatchMatesRules';
import { MatesHistoryDetail, ResultsArena, ResultsPets } from './Results';

// Load the pictures once the app starts, so the arena is there the moment the game opens.
if (typeof Image !== 'undefined') for (const url of allArt()) new Image().src = url;

export const matchMatesUi: GameUi = {
  id: 'matchmates',
  name: 'Pet Match',
  emoji: '🐲',
  logo: logoUrl,
  tagline: 'Match tiles, evolve your pet and win the duel.',
  Component: MatchMatesGame,
  LobbyOptions: MatesOptions,
  Rules: ({ open, onClose }) => createElement(MatchMatesRules, { open, onClose }),
  // The standings show the hit points left ("45 HP", "0 HP"), the arena and the pets that were chosen.
  scoreText: (score) => `${score} HP`,
  historyDetail: (entry) => createElement(MatesHistoryDetail, { entry }),
  resultsHeader: (room) => createElement(ResultsArena, { room }),
  resultsRowExtra: (room, playerId) => createElement(ResultsPets, { room, playerId }),
  // Let the last move (swap, cascades, the final attack) play out before the standings.
  resultsDelayMs: (room) => {
    const e = (room.game?.view as matchmates.MatesView | undefined)?.lastEvent;
    return e
      ? matchmates.SWAP_MS +
          e.steps.length * matchmates.STEP_MS +
          e.fires.length * matchmates.FIRE_MS +
          700 +
          (e.win ? END_DROP_MS : 0)
      : 700;
  },
};
