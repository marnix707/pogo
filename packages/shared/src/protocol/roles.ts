import { z } from 'zod';
import type { PublicUser } from './events';

/** What a person may do in the admin panel. `dev` is not a role: it is a tag shown behind the name. */
export const ROLES = ['user', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };
export const roleRank = (role: Role | undefined): number => RANK[role ?? 'user'];
export const isStaff = (user: Pick<PublicUser, 'role'> | null | undefined): boolean =>
  roleRank(user?.role) >= RANK.moderator;

/** The name other players see: the nickname with "(dev)" behind it for developers. */
export const displayName = (user: Pick<PublicUser, 'nickname' | 'isDev'>): string =>
  user.isDev ? `${user.nickname} (dev)` : user.nickname;

/** Moderators can ban for at most this long; only admins can ban for longer or for good. */
export const MODERATOR_MAX_BAN_MINUTES = 7 * 24 * 60;

// ---- admin API ---------------------------------------------------------------------------

export const banSchema = z.object({
  /** Minutes; null = permanent (admins only). */
  minutes: z
    .number()
    .int()
    .min(1)
    .max(10 * 365 * 24 * 60)
    .nullable(),
  reason: z.string().trim().max(200).default(''),
  /** Also block the IP address the player last used (guests can otherwise just start over). */
  blockIp: z.boolean().default(true),
});
export type BanInput = z.infer<typeof banSchema>;

export const roleSchema = z.object({ role: z.enum(ROLES) });
export const devSchema = z.object({ isDev: z.boolean() });

export interface AdminUserRow {
  id: string;
  nickname: string;
  avatar: string;
  isGuest: boolean;
  /** Admins only. */
  email?: string;
  role: Role;
  isDev: boolean;
  createdAt: number;
  lastSeenAt: number | null;
  online: boolean;
  roomCode: string | null;
  /** Active ban, if any. */
  ban: AdminBanRow | null;
}

export interface AdminBanRow {
  id: string;
  userId: string | null;
  nickname: string;
  ip: string | null;
  reason: string;
  byName: string;
  createdAt: number;
  /** null = permanent. */
  expiresAt: number | null;
}

export interface AdminRoomRow {
  code: string;
  gameId: string;
  status: string;
  visibility: string;
  members: { id: string; nickname: string; bot: boolean; connected: boolean }[];
}

export interface AdminAuditRow {
  id: string;
  at: number;
  actorName: string;
  action: string;
  targetName: string;
  detail: string;
}
