import { createElement } from 'react';
import type { GameUi } from '../types';
import { KarmaGame } from './KarmaGame';
import { KarmaRules } from './KarmaRules';
import { ModePicker } from './ModePicker';
import { RulePick } from './RulePick';
import { REVEAL_HOLD_MS, leftoverCount, revealStartMs, revealTotalMs } from './reveal';

export const karmaUi: GameUi = {
  id: 'karma',
  name: 'Karma',
  emoji: '🃏',
  tagline: 'Shed all your cards. Don’t be the last one left.',
  Component: KarmaGame,
  LobbyOptions: ModePicker,
  Rules: ({ open, onClose, room }) =>
    createElement(KarmaRules, {
      open,
      onClose,
      rules: (room.game?.view as { rules?: string[] } | undefined)?.rules,
    }),
  ownFanfare: true, // the winner's fanfare plays when the last card has turned over (KarmaGame)
  // Party mode: the standings are already known while the winner picks a rule (RulePick, in the panel).
  pendingResults(room) {
    const view = room.game?.view as { phase?: string; finishOrder?: string[] } | undefined;
    if (view?.phase !== 'pick' || !view.finishOrder) return null;
    const n = view.finishOrder.length;
    return {
      rankings: view.finishOrder.map((playerId, i) => ({
        playerId,
        score: n - 1 - i,
        rank: i + 1,
      })),
    };
  },
  ResultsExtra: RulePick,
  hideScores: true, // the score is only a rank in Karma
  // The last card's win reveal (KarmaGame's WinReveal) must finish before the standings cover it.
  resultsDelayMs(room) {
    const view = room.game?.view as
      | {
          lastEvent?: { out: boolean; kind: string; playerId: string } | null;
          finishOrder: string[];
          leftovers?: { hand: number[]; faceDown: (number | null)[] } | null;
        }
      | undefined;
    // After a blind last card its own reveal runs (turn, then confetti); the loser turns over what
    // is left from the moment that card has turned, and the standings wait until it is all seen.
    const ev = view?.lastEvent;
    const blindOut = !!ev?.out && ev.kind === 'blind';
    const blind = blindOut ? (view!.finishOrder[0] === ev.playerId ? 5500 : 4000) : 0;
    const n = leftoverCount(view?.leftovers);
    const leftovers = n > 0 ? revealTotalMs(n, revealStartMs(blindOut)) + REVEAL_HOLD_MS : 0;
    return Math.max(blind, leftovers);
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
