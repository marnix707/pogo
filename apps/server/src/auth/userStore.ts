import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { BOT_AVATAR, displayName } from '@pogo/shared';
import type {
  AdminMatchRow,
  MatchHistoryEntry,
  PublicUser,
  Role,
  TogetherView,
} from '@pogo/shared';

export interface EmailCodeRecord {
  codeHash: string;
  userId: string | null;
  attempts: number;
  expiresAt: number;
}

export type CodePurpose = 'register' | 'reset';

export interface ResultRow {
  userId: string;
  matchId: string;
  gameId: string;
  rank: number;
  score: number;
  players: number;
  bots: number;
  /** The match history entry (`MatchHistoryEntry` without ids): who played and the game's facts. */
  summary?: { players: MatchHistoryEntry['players']; detail: MatchHistoryEntry['detail'] };
}

export interface GameStats {
  gameId: string;
  games: number;
  wins: number;
  bestScore: number;
  avgRank: number;
  /** The most recent result is the player's best score (and not their first game). */
  lastIsBest: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  avatar: string;
  games: number;
  wins: number;
  bestScore: number;
}

export interface StoredImage {
  mime: string;
  data: Buffer;
  version: number;
}

/** A user as the admin panel sees them. */
export interface StaffUserRecord {
  user: PublicUser;
  createdAt: number;
  lastSeenAt: number | null;
  lastIp: string | null;
}

export interface UserStore {
  createGuest(profile: { nickname: string; avatar: string }): Promise<PublicUser>;
  get(id: string): Promise<PublicUser | null>;
  updateProfile(
    id: string,
    profile: { nickname: string; avatar: string },
  ): Promise<PublicUser | null>;

  // ---- accounts ----
  /** The user with this (lowercase) email and their password hash. */
  getByEmail(email: string): Promise<{ user: PublicUser; passwordHash: string | null } | null>;
  /** Turn a guest into a registered user. Returns 'taken' when the email belongs to someone else. */
  register(id: string, email: string, passwordHash: string): Promise<PublicUser | 'taken' | null>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  putCode(
    email: string,
    purpose: CodePurpose,
    record: Omit<EmailCodeRecord, 'attempts'>,
  ): Promise<void>;
  getCode(email: string, purpose: CodePurpose): Promise<EmailCodeRecord | null>;
  bumpCodeAttempts(email: string, purpose: CodePurpose): Promise<void>;
  deleteCode(email: string, purpose: CodePurpose): Promise<void>;
  passwordHashOf(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;

  // ---- admin ----
  /** Find players by nickname or email (newest first); an empty query lists the most recently seen. */
  search(query: string, limit: number): Promise<StaffUserRecord[]>;
  setRole(id: string, role: Role): Promise<PublicUser | null>;
  setDev(id: string, isDev: boolean): Promise<PublicUser | null>;
  /** Registered players only (guests are never listed), most recently seen first. */
  listRegistered(query: string, limit: number): Promise<StaffUserRecord[]>;
  /** Prefix and suffix around the nickname; empty strings clear them. */
  setTitles(id: string, prefix: string, suffix: string): Promise<PublicUser | null>;
  /** Remember when and from where the player was last seen (for IP bans). */
  touch(id: string, ip: string | null): Promise<void>;
  lastIpOf(id: string): Promise<string | null>;

  // ---- avatar picture ----
  setImage(id: string, image: { mime: string; data: Buffer }): Promise<PublicUser | null>;
  getImage(id: string): Promise<StoredImage | null>;
  clearImage(id: string, fallbackAvatar: string): Promise<PublicUser | null>;

  // ---- results ----
  recordResults(rows: ResultRow[]): Promise<void>;
  statsFor(userId: string): Promise<GameStats[]>;
  leaderboard(gameId: string, limit: number): Promise<LeaderboardEntry[]>;
  /** The games `meId` and `otherId` played in the same match (the head to head). */
  together(meId: string, otherId: string): Promise<TogetherView>;
  // ---- admin ----
  /** The latest finished games of everybody (one entry per match), optionally one game. */
  recentMatches(limit: number, gameId?: string): Promise<AdminMatchRow[]>;
  /** Registered accounts and guests. */
  playerCounts(): Promise<{ registered: number; guests: number }>;
  /** Matches played since a time, per game (one count per match, not per player). */
  matchCounts(sinceMs: number): Promise<{ gameId: string; matches: number }[]>;
  /** The player's last games, newest first (the match history). */
  history(userId: string, limit: number): Promise<MatchHistoryEntry[]>;
  /** Move every result of `fromId` to `toId` (skipping matches `toId` already has) and delete `fromId`. */
  mergeInto(fromId: string, toId: string): Promise<number>;
}

/** An uploaded picture: `img:<userId>:<version>` (the web app builds the image URL from it). */
const imageAvatar = (id: string, version: number) => `img:${id}:${version}`;

function summarize(
  gameId: string,
  rows: { rank: number; score: number; playedAt: number }[],
): GameStats {
  const sorted = [...rows].sort((a, b) => a.playedAt - b.playedAt);
  const best = Math.max(...sorted.map((r) => r.score));
  const last = sorted[sorted.length - 1]!;
  return {
    gameId,
    games: sorted.length,
    wins: sorted.filter((r) => r.rank === 1).length,
    bestScore: best,
    avgRank: sorted.reduce((a, r) => a + r.rank, 0) / sorted.length,
    lastIsBest: sorted.length > 1 && last.score >= best && last.score > 0,
  };
}

export function createPrismaUserStore(prisma: PrismaClient): UserStore {
  const toPublic = (u: {
    id: string;
    nickname: string;
    avatar: string;
    isGuest: boolean;
    email?: string | null;
    role?: string;
    isDev?: boolean;
    prefix?: string | null;
    suffix?: string | null;
  }): PublicUser => ({
    id: u.id,
    nickname: u.nickname,
    // The robot is for computer players only; accounts that picked it earlier get the fox.
    avatar: u.avatar === BOT_AVATAR ? 'fox' : u.avatar,
    isGuest: u.isGuest,
    ...(u.email ? { email: u.email } : {}),
    ...(u.role === 'moderator' || u.role === 'admin' ? { role: u.role } : {}),
    ...(u.isDev ? { isDev: true } : {}),
    ...(u.prefix ? { prefix: u.prefix } : {}),
    ...(u.suffix ? { suffix: u.suffix } : {}),
  });
  const find = async (id: string) => {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? toPublic(user) : null;
  };
  const searchRows = async (query: string, limit: number, registeredOnly: boolean) => {
    const q = query.trim();
    const rows = await prisma.user.findMany({
      where: {
        ...(registeredOnly ? { isGuest: false } : {}),
        ...(q
          ? {
              OR: [
                { nickname: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q.toLowerCase() } },
                { id: q },
              ],
            }
          : {}),
      },
      orderBy: [
        { lastSeenAt: { sort: 'desc' as const, nulls: 'last' as const } },
        { createdAt: 'desc' as const },
      ],
      take: limit,
    });
    return rows.map((u) => ({
      user: toPublic(u),
      createdAt: u.createdAt.getTime(),
      lastSeenAt: u.lastSeenAt?.getTime() ?? null,
      lastIp: u.lastIp,
    }));
  };
  return {
    createGuest: async (profile) => toPublic(await prisma.user.create({ data: profile })),
    get: find,
    updateProfile: async (id, profile) => {
      try {
        return toPublic(await prisma.user.update({ where: { id }, data: profile }));
      } catch {
        return null;
      }
    },

    async getByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? { user: toPublic(user), passwordHash: user.passwordHash } : null;
    },
    async register(id, email, passwordHash) {
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken && taken.id !== id) return 'taken';
      try {
        return toPublic(
          await prisma.user.update({
            where: { id },
            data: { email, passwordHash, isGuest: false, registeredAt: new Date() },
          }),
        );
      } catch {
        return null;
      }
    },
    async setPassword(id, passwordHash) {
      await prisma.user.update({ where: { id }, data: { passwordHash } });
    },
    async putCode(email, purpose, record) {
      const data = {
        codeHash: record.codeHash,
        userId: record.userId,
        expiresAt: new Date(record.expiresAt),
        attempts: 0,
      };
      await prisma.emailCode.upsert({
        where: { email_purpose: { email, purpose } },
        create: { email, purpose, ...data },
        update: data,
      });
    },
    async getCode(email, purpose) {
      const row = await prisma.emailCode.findUnique({
        where: { email_purpose: { email, purpose } },
      });
      return row
        ? {
            codeHash: row.codeHash,
            userId: row.userId,
            attempts: row.attempts,
            expiresAt: row.expiresAt.getTime(),
          }
        : null;
    },
    async bumpCodeAttempts(email, purpose) {
      await prisma.emailCode
        .update({
          where: { email_purpose: { email, purpose } },
          data: { attempts: { increment: 1 } },
        })
        .catch(() => undefined);
    },
    async deleteCode(email, purpose) {
      await prisma.emailCode.deleteMany({ where: { email, purpose } });
    },
    async passwordHashOf(id) {
      return (await prisma.user.findUnique({ where: { id } }))?.passwordHash ?? null;
    },
    async delete(id) {
      await prisma.user.deleteMany({ where: { id } });
    },

    async search(query, limit) {
      return searchRows(query, limit, false);
    },
    async listRegistered(query, limit) {
      return searchRows(query, limit, true);
    },
    async setTitles(id, prefix, suffix) {
      try {
        return toPublic(
          await prisma.user.update({
            where: { id },
            data: { prefix: prefix || null, suffix: suffix || null },
          }),
        );
      } catch {
        return null;
      }
    },
    async setRole(id, role) {
      try {
        return toPublic(await prisma.user.update({ where: { id }, data: { role } }));
      } catch {
        return null;
      }
    },
    async setDev(id, isDev) {
      try {
        return toPublic(await prisma.user.update({ where: { id }, data: { isDev } }));
      } catch {
        return null;
      }
    },
    async touch(id, ip) {
      await prisma.user
        .update({ where: { id }, data: { lastSeenAt: new Date(), ...(ip ? { lastIp: ip } : {}) } })
        .catch(() => undefined);
    },
    async lastIpOf(id) {
      return (await prisma.user.findUnique({ where: { id } }))?.lastIp ?? null;
    },

    async setImage(id, image) {
      try {
        const row = await prisma.userImage.upsert({
          where: { userId: id },
          create: { userId: id, ...image },
          update: { ...image, version: { increment: 1 }, updatedAt: new Date() },
        });
        return toPublic(
          await prisma.user.update({
            where: { id },
            data: { avatar: imageAvatar(id, row.version) },
          }),
        );
      } catch {
        return null;
      }
    },
    async getImage(id) {
      const row = await prisma.userImage.findUnique({ where: { userId: id } });
      return row ? { mime: row.mime, data: Buffer.from(row.data), version: row.version } : null;
    },
    async clearImage(id, fallbackAvatar) {
      await prisma.userImage.deleteMany({ where: { userId: id } });
      try {
        return toPublic(
          await prisma.user.update({ where: { id }, data: { avatar: fallbackAvatar } }),
        );
      } catch {
        return null;
      }
    },

    async recordResults(rows) {
      if (rows.length === 0) return;
      await prisma.gameResult.createMany({
        data: rows.map((r) => ({ ...r, summary: r.summary as unknown as Prisma.InputJsonValue })),
        skipDuplicates: true,
      });
    },
    async statsFor(userId) {
      const rows = await prisma.gameResult.findMany({ where: { userId } });
      const byGame = new Map<string, typeof rows>();
      for (const r of rows) byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]);
      return [...byGame].map(([gameId, list]) =>
        summarize(
          gameId,
          list.map((r) => ({ rank: r.rank, score: r.score, playedAt: r.playedAt.getTime() })),
        ),
      );
    },
    async recentMatches(limit, gameId) {
      const rows = await prisma.gameResult.findMany({
        where: gameId ? { gameId } : {},
        orderBy: { playedAt: 'desc' },
        take: limit * 6,
      });
      const ids = [...new Set(rows.map((r) => r.userId))];
      const people = await prisma.user.findMany({ where: { id: { in: ids } } });
      const named = new Map(people.map((u) => [u.id, toPublic(u)]));
      return groupMatches(
        rows.map((r) => ({
          matchId: r.matchId,
          gameId: r.gameId,
          playedAt: r.playedAt.getTime(),
          userId: r.userId,
          rank: r.rank,
          score: r.score,
          summary: r.summary,
        })),
        (id) => named.get(id) ?? null,
        limit,
      );
    },
    async playerCounts() {
      const [registered, guests] = await Promise.all([
        prisma.user.count({ where: { isGuest: false } }),
        prisma.user.count({ where: { isGuest: true } }),
      ]);
      return { registered, guests };
    },
    async matchCounts(sinceMs) {
      const rows = await prisma.gameResult.findMany({
        where: { playedAt: { gte: new Date(sinceMs) } },
        select: { matchId: true, gameId: true },
        take: 50000,
      });
      return countMatches(rows);
    },
    async together(meId, otherId) {
      const mine = await prisma.gameResult.findMany({
        where: { userId: meId },
        orderBy: { playedAt: 'desc' },
        take: 2000,
      });
      const theirs = await prisma.gameResult.findMany({
        where: { userId: otherId, matchId: { in: mine.map((r) => r.matchId) } },
      });
      return togetherOf(
        mine.map((r) => ({
          matchId: r.matchId,
          gameId: r.gameId,
          rank: r.rank,
          playedAt: r.playedAt.getTime(),
        })),
        theirs.map((r) => ({ matchId: r.matchId, rank: r.rank })),
      );
    },
    async history(userId, limit) {
      const rows = await prisma.gameResult.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: limit,
      });
      return rows.map((r) => toHistory(r.matchId, r.gameId, r.playedAt.getTime(), r.summary));
    },
    async leaderboard(gameId, limit) {
      // 'all' = every game together (played and won over all of them).
      const game = gameId === ALL_GAMES ? {} : { gameId };
      const grouped = await prisma.gameResult.groupBy({
        by: ['userId'],
        where: { ...game, user: { isGuest: false } },
        _count: { _all: true },
        _max: { score: true },
      });
      const wins = await prisma.gameResult.groupBy({
        by: ['userId'],
        where: { ...game, rank: 1, user: { isGuest: false } },
        _count: { _all: true },
      });
      const winMap = new Map(wins.map((w) => [w.userId, w._count._all]));
      const users = await prisma.user.findMany({
        where: { id: { in: grouped.map((g) => g.userId) } },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      return grouped
        .map((g) => ({
          userId: g.userId,
          nickname: userMap.get(g.userId) ? displayName(userMap.get(g.userId)!) : '?',
          avatar: userMap.get(g.userId)?.avatar ?? 'fox',
          games: g._count._all,
          wins: winMap.get(g.userId) ?? 0,
          bestScore: g._max.score ?? 0,
        }))
        .sort((a, b) => ordering(gameId, a, b))
        .slice(0, limit);
    },
    async mergeInto(fromId, toId) {
      return prisma.$transaction(async (tx) => {
        const mine = await tx.gameResult.findMany({
          where: { userId: toId },
          select: { matchId: true },
        });
        const have = new Set(mine.map((m) => m.matchId));
        const theirs = await tx.gameResult.findMany({ where: { userId: fromId } });
        const move = theirs.filter((r) => !have.has(r.matchId)).map((r) => r.id);
        await tx.gameResult.updateMany({ where: { id: { in: move } }, data: { userId: toId } });
        await tx.user.deleteMany({ where: { id: fromId } });
        return move.length;
      });
    },
  };
}

/** Yatzy ranks by best score; every other game by wins (then games played). */
/** Result rows (one per human per game) grouped into one entry per match, newest first. */
function groupMatches(
  rows: {
    matchId: string;
    gameId: string;
    playedAt: number;
    userId: string;
    rank: number;
    score: number;
    summary?: unknown;
  }[],
  who: (id: string) => PublicUser | null,
  limit: number,
): AdminMatchRow[] {
  const byMatch = new Map<string, typeof rows>();
  for (const r of rows) byMatch.set(r.matchId, [...(byMatch.get(r.matchId) ?? []), r]);
  const out: AdminMatchRow[] = [];
  for (const list of byMatch.values()) {
    const first = list[0]!;
    const stored = list.find((r) => r.summary)?.summary as
      { players?: AdminMatchRow['players']; detail?: AdminMatchRow['detail'] } | undefined;
    // Older rows have no summary: the humans from the result rows are all that is known.
    const players =
      stored?.players ??
      list
        .map((r) => {
          const u = who(r.userId);
          return {
            id: r.userId,
            nickname: u ? displayName(u) : 'Player',
            avatar: u?.avatar ?? '',
            bot: false,
            rank: r.rank,
            score: r.score,
          };
        })
        .sort((a, b) => a.rank - b.rank);
    out.push({
      matchId: first.matchId,
      gameId: first.gameId,
      playedAt: Math.max(...list.map((r) => r.playedAt)),
      players,
      detail: stored?.detail ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** One count per match (the result rows are one per player). */
function countMatches(
  rows: { matchId: string; gameId: string }[],
): { gameId: string; matches: number }[] {
  const seen = new Set<string>();
  const per = new Map<string, number>();
  for (const r of rows) {
    if (seen.has(r.matchId)) continue;
    seen.add(r.matchId);
    per.set(r.gameId, (per.get(r.gameId) ?? 0) + 1);
  }
  return [...per].map(([gameId, matches]) => ({ gameId, matches }));
}

/** The head to head of two players from their result rows (a game is "together" when they share a match id). */
function togetherOf(
  mine: { matchId: string; gameId: string; rank: number; playedAt: number }[],
  theirs: { matchId: string; rank: number }[],
): TogetherView {
  const other = new Map(theirs.map((r) => [r.matchId, r.rank]));
  const view: TogetherView = {
    games: 0,
    myWins: 0,
    theirWins: 0,
    ties: 0,
    byGame: [],
    lastAt: null,
  };
  const per = new Map<string, TogetherView['byGame'][number]>();
  for (const r of mine) {
    const theirRank = other.get(r.matchId);
    if (theirRank === undefined) continue;
    view.games++;
    const g = per.get(r.gameId) ?? { gameId: r.gameId, games: 0, myWins: 0, theirWins: 0 };
    g.games++;
    if (r.rank < theirRank) (view.myWins++, g.myWins++);
    else if (r.rank > theirRank) (view.theirWins++, g.theirWins++);
    else view.ties++;
    per.set(r.gameId, g);
    view.lastAt = Math.max(view.lastAt ?? 0, r.playedAt);
  }
  view.byGame = [...per.values()].sort((a, b) => b.games - a.games);
  return view;
}

/** A stored result row as a match history entry (older rows have no summary: just the game and the date). */
function toHistory(
  matchId: string,
  gameId: string,
  playedAt: number,
  summary: unknown,
): MatchHistoryEntry {
  const s = (summary ?? {}) as Partial<{
    players: MatchHistoryEntry['players'];
    detail: MatchHistoryEntry['detail'];
  }>;
  return { matchId, gameId, playedAt, players: s.players ?? [], detail: s.detail ?? null };
}

/** The leaderboard pseudo game that adds up every game. */
export const ALL_GAMES = 'all';

function ordering(gameId: string, a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (gameId === 'yatzy') return b.bestScore - a.bestScore || b.wins - a.wins;
  return b.wins - a.wins || b.games - a.games;
}

/** In-memory store for tests. */
export function createMemoryUserStore(): UserStore {
  const users = new Map<string, PublicUser>();
  const passwords = new Map<string, string>();
  const codes = new Map<string, EmailCodeRecord>();
  const images = new Map<string, StoredImage>();
  const results: (ResultRow & { playedAt: number })[] = [];
  const meta = new Map<
    string,
    { createdAt: number; lastSeenAt: number | null; ip: string | null }
  >();
  const codeKey = (email: string, purpose: string) => `${purpose}:${email}`;
  const memSearch = (query: string, limit: number, registeredOnly: boolean) => {
    const q = query.trim().toLowerCase();
    return [...users.values()]
      .filter(
        (u) =>
          (!registeredOnly || !u.isGuest) &&
          (!q ||
            u.nickname.toLowerCase().includes(q) ||
            u.email?.includes(q) ||
            u.id === query.trim()),
      )
      .map((user) => {
        const m = meta.get(user.id) ?? { createdAt: 0, lastSeenAt: null, ip: null };
        return { user, createdAt: m.createdAt, lastSeenAt: m.lastSeenAt, lastIp: m.ip };
      })
      .sort((a, b) => (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt))
      .slice(0, limit);
  };
  return {
    async createGuest(profile) {
      const user: PublicUser = { id: randomUUID(), isGuest: true, ...profile };
      users.set(user.id, user);
      meta.set(user.id, { createdAt: Date.now(), lastSeenAt: null, ip: null });
      return user;
    },
    get: async (id) => users.get(id) ?? null,
    async updateProfile(id, profile) {
      const existing = users.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...profile };
      users.set(id, updated);
      return updated;
    },

    async getByEmail(email) {
      const user = [...users.values()].find((u) => u.email === email);
      return user ? { user, passwordHash: passwords.get(user.id) ?? null } : null;
    },
    async register(id, email, passwordHash) {
      const existing = users.get(id);
      if (!existing) return null;
      if ([...users.values()].some((u) => u.email === email && u.id !== id)) return 'taken';
      const updated = { ...existing, email, isGuest: false };
      users.set(id, updated);
      passwords.set(id, passwordHash);
      return updated;
    },
    async setPassword(id, passwordHash) {
      passwords.set(id, passwordHash);
    },
    async putCode(email, purpose, record) {
      codes.set(codeKey(email, purpose), { ...record, attempts: 0 });
    },
    getCode: async (email, purpose) => codes.get(codeKey(email, purpose)) ?? null,
    async bumpCodeAttempts(email, purpose) {
      const c = codes.get(codeKey(email, purpose));
      if (c) c.attempts += 1;
    },
    async deleteCode(email, purpose) {
      codes.delete(codeKey(email, purpose));
    },
    passwordHashOf: async (id) => passwords.get(id) ?? null,
    async delete(id) {
      users.delete(id);
      meta.delete(id);
      passwords.delete(id);
      images.delete(id);
      for (let i = results.length - 1; i >= 0; i--)
        if (results[i]!.userId === id) results.splice(i, 1);
    },

    async search(query, limit) {
      return memSearch(query, limit, false);
    },
    async listRegistered(query, limit) {
      return memSearch(query, limit, true);
    },
    async setTitles(id, prefix, suffix) {
      const existing = users.get(id);
      if (!existing) return null;
      const { prefix: _p, suffix: _s, ...rest } = existing;
      const updated: PublicUser = {
        ...rest,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      };
      users.set(id, updated);
      return updated;
    },
    async setRole(id, role) {
      const existing = users.get(id);
      if (!existing) return null;
      const { role: _old, ...rest } = existing;
      const updated: PublicUser = role === 'user' ? rest : { ...rest, role };
      users.set(id, updated);
      return updated;
    },
    async setDev(id, isDev) {
      const existing = users.get(id);
      if (!existing) return null;
      const { isDev: _old, ...rest } = existing;
      const updated: PublicUser = isDev ? { ...rest, isDev: true } : rest;
      users.set(id, updated);
      return updated;
    },
    async touch(id, ip) {
      const m = meta.get(id);
      if (!m) return;
      m.lastSeenAt = Date.now();
      if (ip) m.ip = ip;
    },
    lastIpOf: async (id) => meta.get(id)?.ip ?? null,

    async setImage(id, image) {
      const existing = users.get(id);
      if (!existing) return null;
      const version = (images.get(id)?.version ?? 0) + 1;
      images.set(id, { ...image, version });
      const updated = { ...existing, avatar: imageAvatar(id, version) };
      users.set(id, updated);
      return updated;
    },
    getImage: async (id) => images.get(id) ?? null,
    async clearImage(id, fallbackAvatar) {
      const existing = users.get(id);
      if (!existing) return null;
      images.delete(id);
      const updated = { ...existing, avatar: fallbackAvatar };
      users.set(id, updated);
      return updated;
    },

    async recordResults(rows) {
      for (const r of rows) {
        if (!users.has(r.userId)) continue;
        if (results.some((x) => x.userId === r.userId && x.matchId === r.matchId)) continue;
        results.push({ ...r, playedAt: Date.now() + results.length });
      }
    },
    async statsFor(userId) {
      const mine = results.filter((r) => r.userId === userId);
      const games = [...new Set(mine.map((r) => r.gameId))];
      return games.map((g) =>
        summarize(
          g,
          mine.filter((r) => r.gameId === g),
        ),
      );
    },
    async recentMatches(limit, gameId) {
      const rows = results
        .filter((r) => !gameId || r.gameId === gameId)
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, limit * 6);
      return groupMatches(rows, (id) => users.get(id) ?? null, limit);
    },
    async playerCounts() {
      const all = [...users.values()];
      return {
        registered: all.filter((u) => !u.isGuest).length,
        guests: all.filter((u) => u.isGuest).length,
      };
    },
    async matchCounts(sinceMs) {
      return countMatches(results.filter((r) => r.playedAt >= sinceMs));
    },
    async together(meId, otherId) {
      const mine = results.filter((r) => r.userId === meId);
      const theirs = results.filter((r) => r.userId === otherId);
      return togetherOf(
        mine.map((r) => ({
          matchId: r.matchId,
          gameId: r.gameId,
          rank: r.rank,
          playedAt: r.playedAt,
        })),
        theirs.map((r) => ({ matchId: r.matchId, rank: r.rank })),
      );
    },
    async history(userId, limit) {
      return results
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, limit)
        .map((r) => toHistory(r.matchId, r.gameId, r.playedAt, r.summary ?? null));
    },
    async leaderboard(gameId, limit) {
      const inGame = (r: { gameId: string }) => gameId === ALL_GAMES || r.gameId === gameId;
      const ids = [...new Set(results.filter(inGame).map((r) => r.userId))];
      return ids
        .filter((id) => users.get(id)?.isGuest === false)
        .map((id) => {
          const mine = results.filter((r) => r.userId === id && inGame(r));
          const u = users.get(id)!;
          return {
            userId: id,
            nickname: displayName(u),
            avatar: u.avatar,
            games: mine.length,
            wins: mine.filter((r) => r.rank === 1).length,
            bestScore: Math.max(...mine.map((r) => r.score)),
          };
        })
        .sort((a, b) => ordering(gameId, a, b))
        .slice(0, limit);
    },
    async mergeInto(fromId, toId) {
      let moved = 0;
      for (const r of results) {
        if (r.userId !== fromId) continue;
        if (results.some((x) => x.userId === toId && x.matchId === r.matchId)) continue;
        r.userId = toId;
        moved++;
      }
      users.delete(fromId);
      for (let i = results.length - 1; i >= 0; i--)
        if (results[i]!.userId === fromId) results.splice(i, 1);
      return moved;
    },
  };
}
