import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface FriendshipRow {
  /** The other person (from the point of view of whoever asked). */
  otherId: string;
  status: 'pending' | 'accepted';
  requestedBy: string;
  createdAt: number;
}

export interface StoredMessage {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
}

/** Messages kept per pair of players. */
export const KEEP_MESSAGES = 200;

/** Persistence for friendships, blocks, mutes, private messages and invite codes (ids only; names come from the user store). */
export interface FriendStore {
  friendship(
    a: string,
    b: string,
  ): Promise<{ status: 'pending' | 'accepted'; requestedBy: string } | null>;
  createRequest(from: string, to: string): Promise<void>;
  accept(a: string, b: string): Promise<void>;
  remove(a: string, b: string): Promise<void>;
  listFriendships(userId: string): Promise<FriendshipRow[]>;

  block(blocker: string, blocked: string): Promise<void>;
  unblock(blocker: string, blocked: string): Promise<void>;
  /** People `userId` blocked. */
  blockedBy(userId: string): Promise<string[]>;
  /** People who blocked `userId`. */
  blockersOf(userId: string): Promise<string[]>;

  mute(muter: string, muted: string): Promise<void>;
  unmute(muter: string, muted: string): Promise<void>;
  mutedBy(userId: string): Promise<string[]>;

  addMessage(from: string, to: string, text: string): Promise<StoredMessage>;
  /** Newest last; `before` = a message time (ms) to page back from. */
  messages(a: string, b: string, before?: number, limit?: number): Promise<StoredMessage[]>;
  markRead(reader: string, from: string): Promise<void>;
  /** Unread messages per sender. */
  unreadCounts(userId: string): Promise<Map<string, number>>;

  /** My invite code (created on first use). */
  codeOf(userId: string): Promise<string>;
  regenerateCode(userId: string): Promise<string>;
  userIdByCode(code: string): Promise<string | null>;

  /** Everything about a deleted account. */
  purge(userId: string): Promise<void>;
}

const sorted = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const newCode = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);

export function createMemoryFriendStore(now: () => number = Date.now): FriendStore {
  const ships = new Map<
    string,
    {
      low: string;
      high: string;
      status: 'pending' | 'accepted';
      requestedBy: string;
      createdAt: number;
    }
  >();
  const blocks = new Set<string>(); // `${blocker}|${blocked}`
  const mutes = new Set<string>();
  const messages: (StoredMessage & { readAt: number | null })[] = [];
  const codes = new Map<string, string>(); // userId -> code
  let seq = 0;
  const key = (a: string, b: string) => sorted(a, b).join('|');
  const pairOf = (a: string, b: string) => (m: StoredMessage) =>
    (m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a);

  return {
    async friendship(a, b) {
      const s = ships.get(key(a, b));
      return s ? { status: s.status, requestedBy: s.requestedBy } : null;
    },
    async createRequest(from, to) {
      const [low, high] = sorted(from, to);
      ships.set(key(from, to), {
        low,
        high,
        status: 'pending',
        requestedBy: from,
        createdAt: now(),
      });
    },
    async accept(a, b) {
      const s = ships.get(key(a, b));
      if (s) s.status = 'accepted';
    },
    async remove(a, b) {
      ships.delete(key(a, b));
    },
    async listFriendships(userId) {
      return [...ships.values()]
        .filter((s) => s.low === userId || s.high === userId)
        .map((s) => ({
          otherId: s.low === userId ? s.high : s.low,
          status: s.status,
          requestedBy: s.requestedBy,
          createdAt: s.createdAt,
        }));
    },
    async block(blocker, blocked) {
      blocks.add(`${blocker}|${blocked}`);
    },
    async unblock(blocker, blocked) {
      blocks.delete(`${blocker}|${blocked}`);
    },
    async blockedBy(userId) {
      return [...blocks].filter((k) => k.startsWith(`${userId}|`)).map((k) => k.split('|')[1]!);
    },
    async blockersOf(userId) {
      return [...blocks].filter((k) => k.endsWith(`|${userId}`)).map((k) => k.split('|')[0]!);
    },
    async mute(muter, muted) {
      mutes.add(`${muter}|${muted}`);
    },
    async unmute(muter, muted) {
      mutes.delete(`${muter}|${muted}`);
    },
    async mutedBy(userId) {
      return [...mutes].filter((k) => k.startsWith(`${userId}|`)).map((k) => k.split('|')[1]!);
    },
    async addMessage(from, to, text) {
      const m = { id: `m${++seq}`, fromId: from, toId: to, text, createdAt: now(), readAt: null };
      messages.push(m);
      const pair = messages.filter(pairOf(from, to));
      for (const old of pair.slice(0, Math.max(0, pair.length - KEEP_MESSAGES))) {
        messages.splice(messages.indexOf(old), 1);
      }
      return { id: m.id, fromId: from, toId: to, text, createdAt: m.createdAt };
    },
    async messages(a, b, before, limit = 50) {
      const list = messages
        .filter(pairOf(a, b))
        .filter((m) => before === undefined || m.createdAt < before)
        .slice(-limit);
      return list.map(({ readAt: _r, ...m }) => m);
    },
    async markRead(reader, from) {
      for (const m of messages) if (m.toId === reader && m.fromId === from) m.readAt ??= now();
    },
    async unreadCounts(userId) {
      const out = new Map<string, number>();
      for (const m of messages)
        if (m.toId === userId && m.readAt === null) out.set(m.fromId, (out.get(m.fromId) ?? 0) + 1);
      return out;
    },
    async codeOf(userId) {
      let c = codes.get(userId);
      if (!c) codes.set(userId, (c = newCode()));
      return c;
    },
    async regenerateCode(userId) {
      const c = newCode();
      codes.set(userId, c);
      return c;
    },
    async userIdByCode(code) {
      for (const [id, c] of codes) if (c === code) return id;
      return null;
    },
    async purge(userId) {
      for (const [k, s] of ships) if (s.low === userId || s.high === userId) ships.delete(k);
      for (const k of [...blocks])
        if (k.startsWith(`${userId}|`) || k.endsWith(`|${userId}`)) blocks.delete(k);
      for (const k of [...mutes])
        if (k.startsWith(`${userId}|`) || k.endsWith(`|${userId}`)) mutes.delete(k);
      for (let i = messages.length - 1; i >= 0; i--)
        if (messages[i]!.fromId === userId || messages[i]!.toId === userId) messages.splice(i, 1);
      codes.delete(userId);
    },
  };
}

export function createPrismaFriendStore(prisma: PrismaClient): FriendStore {
  const toMs = (d: Date) => d.getTime();
  return {
    async friendship(a, b) {
      const [low, high] = sorted(a, b);
      const s = await prisma.friendship.findUnique({
        where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
      });
      return s ? { status: s.status as 'pending' | 'accepted', requestedBy: s.requestedBy } : null;
    },
    async createRequest(from, to) {
      const [low, high] = sorted(from, to);
      await prisma.friendship.upsert({
        where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
        create: { userLowId: low, userHighId: high, requestedBy: from },
        update: { requestedBy: from, status: 'pending', respondedAt: null },
      });
    },
    async accept(a, b) {
      const [low, high] = sorted(a, b);
      await prisma.friendship.updateMany({
        where: { userLowId: low, userHighId: high },
        data: { status: 'accepted', respondedAt: new Date() },
      });
    },
    async remove(a, b) {
      const [low, high] = sorted(a, b);
      await prisma.friendship.deleteMany({ where: { userLowId: low, userHighId: high } });
    },
    async listFriendships(userId) {
      const rows = await prisma.friendship.findMany({
        where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
      });
      return rows.map((s) => ({
        otherId: s.userLowId === userId ? s.userHighId : s.userLowId,
        status: s.status as 'pending' | 'accepted',
        requestedBy: s.requestedBy,
        createdAt: toMs(s.createdAt),
      }));
    },
    async block(blocker, blocked) {
      await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: blocker, blockedId: blocked } },
        create: { blockerId: blocker, blockedId: blocked },
        update: {},
      });
    },
    async unblock(blocker, blocked) {
      await prisma.userBlock.deleteMany({ where: { blockerId: blocker, blockedId: blocked } });
    },
    async blockedBy(userId) {
      return (await prisma.userBlock.findMany({ where: { blockerId: userId } })).map(
        (b) => b.blockedId,
      );
    },
    async blockersOf(userId) {
      return (await prisma.userBlock.findMany({ where: { blockedId: userId } })).map(
        (b) => b.blockerId,
      );
    },
    async mute(muter, muted) {
      await prisma.userMute.upsert({
        where: { muterId_mutedId: { muterId: muter, mutedId: muted } },
        create: { muterId: muter, mutedId: muted },
        update: {},
      });
    },
    async unmute(muter, muted) {
      await prisma.userMute.deleteMany({ where: { muterId: muter, mutedId: muted } });
    },
    async mutedBy(userId) {
      return (await prisma.userMute.findMany({ where: { muterId: userId } })).map((m) => m.mutedId);
    },
    async addMessage(from, to, text) {
      const m = await prisma.directMessage.create({ data: { fromId: from, toId: to, text } });
      // Keep only the newest KEEP_MESSAGES per pair.
      const old = await prisma.directMessage.findMany({
        where: {
          OR: [
            { fromId: from, toId: to },
            { fromId: to, toId: from },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: KEEP_MESSAGES,
        select: { id: true },
      });
      if (old.length > 0)
        await prisma.directMessage.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      return { id: m.id, fromId: from, toId: to, text, createdAt: toMs(m.createdAt) };
    },
    async messages(a, b, before, limit = 50) {
      const rows = await prisma.directMessage.findMany({
        where: {
          OR: [
            { fromId: a, toId: b },
            { fromId: b, toId: a },
          ],
          ...(before !== undefined ? { createdAt: { lt: new Date(before) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.reverse().map((m) => ({
        id: m.id,
        fromId: m.fromId,
        toId: m.toId,
        text: m.text,
        createdAt: toMs(m.createdAt),
      }));
    },
    async markRead(reader, from) {
      await prisma.directMessage.updateMany({
        where: { toId: reader, fromId: from, readAt: null },
        data: { readAt: new Date() },
      });
    },
    async unreadCounts(userId) {
      const rows = await prisma.directMessage.groupBy({
        by: ['fromId'],
        where: { toId: userId, readAt: null },
        _count: { _all: true },
      });
      return new Map(rows.map((r) => [r.fromId, r._count._all]));
    },
    async codeOf(userId) {
      const existing = await prisma.friendCode.findUnique({ where: { userId } });
      if (existing) return existing.code;
      const code = newCode();
      await prisma.friendCode.upsert({ where: { userId }, create: { userId, code }, update: {} });
      return (await prisma.friendCode.findUnique({ where: { userId } }))!.code;
    },
    async regenerateCode(userId) {
      const code = newCode();
      await prisma.friendCode.upsert({
        where: { userId },
        create: { userId, code },
        update: { code },
      });
      return code;
    },
    async userIdByCode(code) {
      return (await prisma.friendCode.findUnique({ where: { code } }))?.userId ?? null;
    },
    async purge(userId) {
      await prisma.$transaction([
        prisma.friendship.deleteMany({
          where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
        }),
        prisma.userBlock.deleteMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        }),
        prisma.userMute.deleteMany({ where: { OR: [{ muterId: userId }, { mutedId: userId }] } }),
        prisma.directMessage.deleteMany({ where: { OR: [{ fromId: userId }, { toId: userId }] } }),
        prisma.friendCode.deleteMany({ where: { userId } }),
      ]);
    },
  };
}
