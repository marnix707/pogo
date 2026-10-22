import type { GameResults } from '../game/types';
import type {
  EmptyPayload,
  RematchInput,
  RoomReadyInput,
  ChatSendInput,
  GameMoveInput,
  RoomQuickplayInput,
  RoomCreateInput,
  RoomJoinInput,
  RoomKickInput,
  RoomSettingsInput,
  RoomSetGameInput,
  RoomReadyLockInput,
  RoomSuggestInput,
  Visibility,
} from './schemas';

export interface HelloMessage {
  message: string;
  serverTime: number;
}

export interface PublicUser {
  id: string;
  nickname: string;
  /** `fox`..., or `img:<version>` for an uploaded picture. */
  avatar: string;
  isGuest: boolean;
  /** Only in your own profile. */
  email?: string;
  /** Staff powers (admin panel); absent = a normal player. */
  role?: 'user' | 'moderator' | 'admin';
  /** Developer: "(dev)" is shown behind the name everywhere. */
  isDev?: boolean;
  /** Text a developer gave this player: shown before / after the nickname everywhere. */
  prefix?: string;
  suffix?: string;
}

/** `code` is the error code (see errors.ts); `ref` identifies an unexpected server error in the logs. */
export type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; code?: string; ref?: string };
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
  /** A computer player. */
  bot: boolean;
  /** Pressed Ready in the lobby (computer players always are). */
  ready: boolean;
  /** Ready is locked: it stays on across setting changes, game switches and games. */
  readyLock: boolean;
  /** The game this player suggests for the next round (null = none). */
  suggestion: string | null;
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
  /** Computer players that will join when the game starts. */
  bots: number;
  options: unknown;
  turnTimeSec: number;
  status: RoomStatus;
  members: RoomMemberView[];
  /** Server time (ms) at which the game starts by itself (everybody is ready), or null. */
  startsAt: number | null;
  game?: RoomGameView;
  serverTime: number;
}

export interface ChatMessage {
  /** Increases per room; lets clients de-duplicate history and live messages. */
  id: number;
  userId: string;
  nickname: string;
  avatar: string;
  text: string;
  /** Epoch ms (server clock). */
  at: number;
}

/** A joinable public room as shown in the lobby list. */
export interface PublicRoomSummary {
  code: string;
  gameId: string;
  gameName: string;
  hostNickname: string;
  hostAvatar: string;
  players: number;
  maxPlayers: number;
  createdAt: number;
}

export interface ServerToClientEvents {
  hello: (msg: HelloMessage) => void;
  /** The caller's current room (null when they are in none), plus why it went null. */
  'room:state': (room: RoomView | null, reason?: LeaveReason) => void;
  /** Open public rooms, pushed to lobby subscribers whenever the list changes. */
  'lobby:list': (rooms: PublicRoomSummary[]) => void;
  'chat:message': (message: ChatMessage) => void;
  /** The room's recent messages, sent when you join or reconnect. */
  'chat:history': (messages: ChatMessage[]) => void;
}

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreateInput, ack: Ack<RoomView>) => void;
  'room:join': (payload: RoomJoinInput, ack: Ack<RoomView>) => void;
  'room:leave': (payload: EmptyPayload, ack: Ack<null>) => void;
  'room:kick': (payload: RoomKickInput, ack: Ack<null>) => void;
  'room:settings': (payload: RoomSettingsInput, ack: Ack<RoomView>) => void;
  'room:suggest': (payload: RoomSuggestInput, ack: Ack<RoomView>) => void;
  'room:readyLock': (payload: RoomReadyLockInput, ack: Ack<RoomView>) => void;
  'room:setGame': (payload: RoomSetGameInput, ack: Ack<RoomView>) => void;
  'room:ready': (payload: RoomReadyInput, ack: Ack<RoomView>) => void;
  'room:rematch': (payload: RematchInput, ack: Ack<RoomView>) => void;
  'room:quickplay': (payload: RoomQuickplayInput, ack: Ack<RoomView>) => void;
  'game:move': (payload: GameMoveInput, ack: Ack<null>) => void;
  'lobby:subscribe': (payload: EmptyPayload, ack: Ack<PublicRoomSummary[]>) => void;
  'lobby:unsubscribe': (payload: EmptyPayload, ack: Ack<null>) => void;
  'chat:send': (payload: ChatSendInput, ack: Ack<null>) => void;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

/** One game's numbers for a player (GET /api/me/stats). */
export interface GameStatsView {
  gameId: string;
  games: number;
  wins: number;
  bestScore: number;
  avgRank: number;
  /** The latest result is the player's best score (and not their first game). */
  lastIsBest: boolean;
}

export interface LeaderboardRow {
  userId: string;
  nickname: string;
  avatar: string;
  games: number;
  wins: number;
  bestScore: number;
}
