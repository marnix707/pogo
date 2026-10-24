import { createElement } from 'react';
import { karma } from '@pogo/shared';
import type { GameUi } from '../types';
import logoUrl from '../../assets/sprites/brand/logos/karma.svg';
import { KarmaGame } from './KarmaGame';
import { KarmaRules } from './KarmaRules';
import { ModePicker } from './ModePicker';
import { REVEAL_HOLD_MS, leftoverCount, revealStartMs, revealTotalMs } from './reveal';

export const karmaUi: GameUi = {
  id: 'karma',
  name: 'Karma',
  emoji: '🃏',
  logo: logoUrl,
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
    const blind = blindOut ? (view!.finishOrder[0] === ev.playerId ? 4880 : 3380) : 0;
    const n = leftoverCount(view?.leftovers);
    const leftovers = n > 0 ? revealTotalMs(n, revealStartMs(blindOut)) + REVEAL_HOLD_MS : 0;
    return Math.max(blind, leftovers);
  },
  // The emoji of the rules in force, next to the game's name in the top bar.
  titleExtra(room) {
    const view = room.game?.view as { rules?: string[] } | undefined;
    const icons = (view?.rules ?? []).map((id) => karma.ruleById(id)?.emoji).filter(Boolean);
    return icons.length ? icons.join(' ') : undefined;
  },
  // "<name> won!" for everybody but the winner (who gets the generic "You won!").
  resultsTitle(room, me) {
    const winner = room.game?.results?.rankings[0];
    if (!winner || winner.playerId === me) return undefined;
    const name = room.members.find((m) => m.id === winner.playerId)?.nickname ?? 'Someone';
    return `${name} won!`;
  },
};
