import type { ComponentType } from 'react';
import type { Result, RoomView } from '@pogo/shared';

export interface GameUiProps {
  room: RoomView;
  /** The signed-in user's id. */
  me: string;
  /** Send a game move; resolves with the server's verdict (errors are also toasted). */
  sendMove: (move: unknown) => Promise<Result<unknown>>;
}

/** What the web app needs to know about a game; one entry per game in games/registry.ts. */
export interface GameUi {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  Component: ComponentType<GameUiProps>;
  /** Optional custom headline for the results panel (default: "<winner> wins!"). */
  resultsTitle?: (room: RoomView, me: string) => string | undefined;
}
