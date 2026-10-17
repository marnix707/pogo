import type { Result, RoomSettingsInput } from '@pogo/shared';

/** What screens can ask the server to do. Errors are toasted centrally by the shell. */
export interface RoomApi {
  create(gameId: string): Promise<Result<unknown>>;
  /** Join the longest-waiting open public room for this game, or open a new one. */
  quickPlay(gameId: string): Promise<Result<unknown>>;
  join(code: string): Promise<Result<unknown>>;
  leave(): Promise<Result<unknown>>;
  kick(userId: string): Promise<Result<unknown>>;
  updateSettings(patch: RoomSettingsInput): Promise<Result<unknown>>;
  start(): Promise<Result<unknown>>;
  rematch(): Promise<Result<unknown>>;
  move(move: unknown): Promise<Result<unknown>>;
  sendChat(text: string): Promise<Result<unknown>>;
  online: boolean;
}
