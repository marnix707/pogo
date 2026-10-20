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

export interface LobbyOptionsProps {
  room: RoomView;
  isHost: boolean;
  /** Replace the room's game options (host only; validated by the game on the server). */
  setOptions: (options: unknown) => void;
}

/** What the web app needs to know about a game; one entry per game in games/registry.ts. */
export interface GameUi {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  Component: ComponentType<GameUiProps>;
  /** Extra panel in the waiting room for game-specific options (e.g. a game mode). */
  LobbyOptions?: ComponentType<LobbyOptionsProps>;
  /** The game draws its own top bar (leave, chat, settings) instead of the shared title bar. */
  ownHeader?: boolean;
  /** Hide the score column in the standings (for games where the score is just the rank). */
  hideScores?: boolean;
  /** "Play again" starts the next game at once; the results then also offer "Back to lobby". */
  playAgainRestarts?: boolean;
  /** Wait this long after the game ends before showing the results (lets a final animation play). */
  resultsDelayMs?: (room: RoomView) => number;
  /** Optional custom headline for the results panel (default: "<winner> wins!"). */
  resultsTitle?: (room: RoomView, me: string) => string | undefined;
}
