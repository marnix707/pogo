import type { ComponentType } from 'react';
import type { Result, RoomView } from '@pogo/shared';

export interface GameUiProps {
  room: RoomView;
  /** The signed-in user's id. */
  me: string;
  /** Send a game move; resolves with the server's verdict (errors are also toasted). */
  sendMove: (move: unknown) => Promise<Result<unknown>>;
  /** Only for games with `ownHeader`: the room controls the game screen renders itself. */
  chrome?: GameChrome;
}

export interface GameChrome {
  onLeave: () => void;
  onChat: () => void;
  onSettings: () => void;
  unread: number;
}

/** What the web app needs to know about a game; one entry per game in games/registry.ts. */
export interface GameUi {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  Component: ComponentType<GameUiProps>;
  /** The game draws its own top bar (leave, chat, settings) instead of the shared title bar. */
  ownHeader?: boolean;
  /** Hide the score column in the standings (for games where the score is just the rank). */
  hideScores?: boolean;
  /** Wait this long after the game ends before showing the results (lets a final animation play). */
  resultsDelayMs?: (room: RoomView) => number;
  /** Optional custom headline for the results panel (default: "<winner> wins!"). */
  resultsTitle?: (room: RoomView, me: string) => string | undefined;
}
