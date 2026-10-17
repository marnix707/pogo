import type { GameResults } from '../game/types';
import type {
  EmptyPayload,
  GameMoveInput,
  RoomCreateInput,
  RoomJoinInput,
  RoomKickInput,
  RoomSettingsInput,
  Visibility,
} from './schemas';

export interface HelloMessage {
  message: string;
  serverTime: number;
}

export interface PublicUser {
  id: string;
  nickname: string;
  avatar: string;
  isGuest: boolean;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (result: Result<T>) => void;

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type LeaveReason = 'left' | 'kicked' | 'closed' | 'timeout';

export interface RoomMemberView {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
  /** Left mid-game; the seat is auto-played until the game ends. */
  left: boolean;
}

export interface RoomGameView {
  /** Game-specific, already filtered for the receiving player. */
  view: unknown;
  currentPlayers: string[];
  /** Epoch ms (server clock) when the current action times out, or null. */
  deadline: number | null;
  results?: GameResults;
}

export interface RoomView {
  code: string;
  gameId: string;
  gameName: string;
  hostId: string;
  visibility: Visibility;
  minPlayers: number;
  maxPlayers: number;
  options: unknown;
  turnTimeSec: number;
  status: RoomStatus;
  members: RoomMemberView[];
  game?: RoomGameView;
  serverTime: number;
}

export interface ServerToClientEvents {
  hello: (msg: HelloMessage) => void;
  /** The caller's current room (null when they are in none), plus why it went null. */
  'room:state': (room: RoomView | null, reason?: LeaveReason) => void;
}

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreateInput, ack: Ack<RoomView>) => void;
  'room:join': (payload: RoomJoinInput, ack: Ack<RoomView>) => void;
  'room:leave': (payload: EmptyPayload, ack: Ack<null>) => void;
  'room:kick': (payload: RoomKickInput, ack: Ack<null>) => void;
  'room:settings': (payload: RoomSettingsInput, ack: Ack<RoomView>) => void;
  'room:start': (payload: EmptyPayload, ack: Ack<RoomView>) => void;
  'room:rematch': (payload: EmptyPayload, ack: Ack<RoomView>) => void;
  'game:move': (payload: GameMoveInput, ack: Ack<null>) => void;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}
