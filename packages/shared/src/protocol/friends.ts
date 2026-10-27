import { z } from 'zod';

/** A person as friends see them (registered players only). */
export interface PersonView {
  id: string;
  /** The display name (nickname with titles and the dev tag, like everywhere else). */
  name: string;
  avatar: string;
}

/** One entry of the friends list, with what the server knows about them right now. */
export interface FriendView extends PersonView {
  online: boolean;
  /** The game they are in (their room's game id) and whether it is still a lobby; null when in no room. */
  room: { gameId: string; status: 'lobby' | 'playing' | 'finished' } | null;
  /** Unread messages from them (0 when muted). */
  unread: number;
  muted: boolean;
}

export interface FriendRequestView extends PersonView {
  createdAt: number;
}

/** GET /api/friends */
export interface FriendsOverview {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  /** My invite code (the link is `/?friend=<code>`). */
  code: string;
  blocked: PersonView[];
}

export type FriendState = 'none' | 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'blockedBy';

/** GET /api/users/:id/profile */
export interface ProfileView extends PersonView {
  isGuest: boolean;
  /** Per game: games played, wins, best score (registered players only). */
  stats: { gameId: string; games: number; wins: number; bestScore: number }[];
  state: FriendState;
  muted: boolean;
  online: boolean;
}

export interface DirectMessageView {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
}

/** Pushed to a player when a friend invites them into a lobby. */
export interface GameInviteView {
  from: PersonView;
  roomCode: string;
  gameId: string;
}

export const friendRequestSchema = z
  .object({
    userId: z.string().min(1).max(64).optional(),
    code: z.string().min(4).max(32).optional(),
  })
  .refine((v) => !!v.userId !== !!v.code, 'Give a player or a code');
export type FriendRequestInput = z.input<typeof friendRequestSchema>;

export const roomInviteSchema = z.object({ roomCode: z.string().min(3).max(12) });
export type RoomInviteInput = z.input<typeof roomInviteSchema>;

export const FRIENDS_MAX = 200;
export const PENDING_MAX = 50;
