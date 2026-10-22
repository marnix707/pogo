import { z } from 'zod';
import type { PublicUser } from './events';

/** What a person may do in the admin panel. `dev` is not a role: it is a tag shown behind the name. */
export const ROLES = ['user', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };
export const roleRank = (role: Role | undefined): number => RANK[role ?? 'user'];
export const isStaff = (user: Pick<PublicUser, 'role'> | null | undefined): boolean =>
  roleRank(user?.role) >= RANK.moderator;

/** What follows a developer's name in every string other players see (the UI shows it as a rainbow tag). */
export const DEV_TAG = ' (dev)';

/** The name other players see: prefix, nickname and suffix, with "(dev)" behind it for developers. */
export const displayName = (
  user: Pick<PublicUser, 'nickname' | 'isDev'> & { prefix?: string | null; suffix?: string | null },
): string => {
  const name = [user.prefix, user.nickname, user.suffix].filter(Boolean).join(' ');
  return user.isDev ? `${name}${DEV_TAG}` : name;
};

/** Splits a display name into the plain name and whether it carries the developer tag. */
export const splitDevTag = (name: string): { name: string; dev: boolean } =>
  name.endsWith(DEV_TAG)
    ? { name: name.slice(0, -DEV_TAG.length), dev: true }
    : { name, dev: false };

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

/** Longest prefix / suffix a developer can hand out. */
export const TITLE_MAX = 14;
const titleText = z
  .string()
  .trim()
  // One short line: no control characters (an empty string clears the title).
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Invalid text')
  .refine((s) => [...s].length <= TITLE_MAX, `At most ${TITLE_MAX} characters`)
  .default('');
export const titlesSchema = z.object({ prefix: titleText, suffix: titleText });
export type TitlesInput = z.infer<typeof titlesSchema>;

export interface AdminUserRow {
  id: string;
  nickname: string;
  avatar: string;
  isGuest: boolean;
  /** Admins only. */
  email?: string;
  role: Role;
  isDev: boolean;
  prefix: string;
  suffix: string;
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
