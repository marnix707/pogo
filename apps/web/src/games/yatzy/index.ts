import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/yatzy.svg';
import { YatzyGame } from './YatzyGame';
import { YatzyModePicker } from './ModePicker';

export const yatzyUi: GameUi = {
  id: 'yatzy',
  name: 'Yatzy',
  emoji: '🎲',
  logo: logoUrl,
  tagline: 'Roll five dice, chase combos, beat your friends.',
  Component: YatzyGame,
  ownHeader: true,
  // Turn based / Live only matters with more than one player: alone, both are the same game.
  LobbyOptions: YatzyModePicker,
  showLobbyOptions: (room) => room.members.filter((m) => !m.bot).length > 1,
  // The last box is scored with the full animation (dice flying in, the total counting up, Yatzy fire) before
  // the standings cover the table: that takes up to ~2.2s, plus a moment to look at the final card.
  resultsDelayMs: () => 3400,
};
