import type { GameUi } from '../types';
import { KarmaGame } from './KarmaGame';
import { ModePicker } from './ModePicker';

export const karmaUi: GameUi = {
  id: 'karma',
  name: 'Karma',
  emoji: '🃏',
  tagline: 'Shed all your cards. Don’t be the last one left.',
  Component: KarmaGame,
  LobbyOptions: ModePicker,
  hideScores: true, // the score is only a rank in Karma
  // The last card's win reveal (KarmaGame's WinReveal) must finish before the standings cover it.
  resultsDelayMs(room) {
    const view = room.game?.view as
      { lastEvent?: { out: boolean; playerId: string } | null; finishOrder: string[] } | undefined;
    const ev = view?.lastEvent;
    if (!ev?.out) return 0;
    return view!.finishOrder[0] === ev.playerId ? 5500 : 4000;
  },
  resultsTitle(room, me) {
    const results = room.game?.results?.rankings;
    const last = results?.[results.length - 1];
    if (!last) return undefined;
    if (last.playerId === me) return '😬 Karma got you!';
    const name = room.members.find((m) => m.id === last.playerId)?.nickname ?? 'Someone';
    return `😬 ${name} is last`;
  },
};
