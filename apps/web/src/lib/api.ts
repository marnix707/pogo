import type { Result, RoomSettingsInput } from '@pogo/shared';

/** What screens can ask the server to do. Errors are toasted centrally by the shell. */
export interface RoomApi {
  create(gameId: string): Promise<Result<unknown>>;
  /** Start a private game against `bots` computer players, straight away. */
  playComputer(gameId: string, bots: number): Promise<Result<unknown>>;
  /** Join the longest-waiting open public room for this game, or open a new one. */
  quickPlay(gameId: string): Promise<Result<unknown>>;
  join(code: string): Promise<Result<unknown>>;
  leave(): Promise<Result<unknown>>;
  kick(userId: string): Promise<Result<unknown>>;
  updateSettings(patch: RoomSettingsInput): Promise<Result<unknown>>;
  /** Lobby (host): play another game with the same people; nobody leaves the room. */
  setGame(gameId: string): Promise<Result<unknown>>;
  /** Lobby: press or release Ready; the game starts by itself when everybody is ready. */
  ready(ready: boolean): Promise<Result<unknown>>;
  /** Lock Ready: it stays on across setting changes, game switches and games. */
  readyLock(locked: boolean): Promise<Result<unknown>>;
  rematch(toLobby?: boolean): Promise<Result<unknown>>;
  move(move: unknown): Promise<Result<unknown>>;
  sendChat(text: string): Promise<Result<unknown>>;
  online: boolean;
}
