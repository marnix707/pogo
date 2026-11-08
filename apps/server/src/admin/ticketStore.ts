import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  TicketDetail,
  TicketPatchInput,
  TicketPriority,
  TicketRow,
  TicketStatus,
  TicketType,
} from '@pogo/shared';

export interface NewTicket {
  userId: string | null;
  nickname: string;
  type: TicketType;
  priority: TicketPriority | null;
  message: string;
  client: Record<string, unknown>;
  server: Record<string, unknown> | null;
  screenshot: { mime: string; data: Buffer } | null;
}

export interface TicketFilter {
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  /** Statuses that are still open (anything but closed / wontfix / duplicate). */
  open?: boolean;
  q?: string;
}

const DONE: TicketStatus[] = ['closed', 'wontfix', 'duplicate'];

/** Persistence for bug reports and feedback (Prisma in production, memory in tests). */
export interface TicketStore {
  create(ticket: NewTicket, now: number): Promise<TicketDetail>;
  list(filter: TicketFilter, limit: number): Promise<TicketRow[]>;
  get(id: string): Promise<TicketDetail | null>;
  screenshot(id: string): Promise<{ mime: string; data: Buffer } | null>;
  patch(id: string, patch: TicketPatchInput, now: number): Promise<TicketDetail | null>;
  /** How many reports a player has sent since `since`. */
  countSince(userId: string, since: number): Promise<number>;
  /** Removes finished tickets that were last touched before `before`; returns how many. */
  purgeDone(before: number): Promise<number>;
}

const screenOf = (client: Record<string, unknown>) =>
  typeof client.screen === 'string' ? client.screen : '';
const gameOf = (client: Record<string, unknown>): string | null => {
  const room = client.room as { gameId?: unknown } | null | undefined;
  return room && typeof room.gameId === 'string' ? room.gameId : null;
};
const matches = (t: TicketDetail, f: TicketFilter) =>
  (!f.status || t.status === f.status) &&
  (!f.type || t.type === f.type) &&
  (!f.priority || t.priority === f.priority) &&
  (!f.open || !DONE.includes(t.status)) &&
  (!f.q || `${t.message} ${t.nickname}`.toLowerCase().includes(f.q.toLowerCase()));
const row = (t: TicketDetail): TicketRow => {
  const { client: _c, server: _s, adminNote: _a, claudeNote: _n, ...rest } = t;
  return rest;
};

export function createMemoryTicketStore(): TicketStore {
  const tickets: TicketDetail[] = [];
  const shots = new Map<string, { mime: string; data: Buffer }>();
  return {
    async create(t, now) {
      const detail: TicketDetail = {
        id: randomUUID(),
        type: t.type,
        priority: t.priority,
        status: 'new',
        message: t.message,
        userId: t.userId,
        nickname: t.nickname,
        screen: screenOf(t.client),
        gameId: gameOf(t.client),
        hasScreenshot: !!t.screenshot,
        createdAt: now,
        updatedAt: now,
        client: t.client,
        server: t.server,
        adminNote: '',
        claudeNote: '',
      };
      tickets.push(detail);
      if (t.screenshot) shots.set(detail.id, t.screenshot);
      return detail;
    },
    async list(filter, limit) {
      return tickets
        .filter((t) => matches(t, filter))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(row);
    },
    get: async (id) => tickets.find((t) => t.id === id) ?? null,
    screenshot: async (id) => shots.get(id) ?? null,
    async patch(id, patch, now) {
      const t = tickets.find((x) => x.id === id);
      if (!t) return null;
      if (patch.status) t.status = patch.status;
      if (patch.priority) t.priority = patch.priority;
      if (patch.adminNote !== undefined) t.adminNote = patch.adminNote;
      if (patch.claudeNote !== undefined) t.claudeNote = patch.claudeNote;
      t.updatedAt = now;
      return t;
    },
    countSince: async (userId, since) =>
      tickets.filter((t) => t.userId === userId && t.createdAt >= since).length,
    async purgeDone(before) {
      let n = 0;
      for (let i = tickets.length - 1; i >= 0; i--) {
        const t = tickets[i]!;
        if (DONE.includes(t.status) && t.updatedAt < before) {
          shots.delete(t.id);
          tickets.splice(i, 1);
          n++;
        }
      }
      return n;
    },
  };
}

type DbTicket = {
  id: string;
  userId: string | null;
  nickname: string;
  type: string;
  priority: string | null;
  status: string;
  message: string;
  client: Prisma.JsonValue;
  server: Prisma.JsonValue | null;
  adminNote: string;
  claudeNote: string;
  createdAt: Date;
  updatedAt: Date;
};

export function createPrismaTicketStore(prisma: PrismaClient): TicketStore {
  const obj = (v: Prisma.JsonValue | null): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const toDetail = (t: DbTicket, hasScreenshot: boolean): TicketDetail => {
    const client = obj(t.client);
    return {
      id: t.id,
      type: t.type as TicketType,
      priority: t.priority as TicketPriority | null,
      status: t.status as TicketStatus,
      message: t.message,
      userId: t.userId,
      nickname: t.nickname,
      screen: screenOf(client),
      gameId: gameOf(client),
      hasScreenshot,
      createdAt: t.createdAt.getTime(),
      updatedAt: t.updatedAt.getTime(),
      client,
      server: t.server ? obj(t.server) : null,
      adminNote: t.adminNote,
      claudeNote: t.claudeNote,
    };
  };
  const where = (f: TicketFilter): Prisma.TicketWhereInput => ({
    ...(f.status ? { status: f.status } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.open ? { status: { notIn: DONE } } : {}),
    ...(f.q
      ? {
          OR: [
            { message: { contains: f.q, mode: 'insensitive' } },
            { nickname: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  });
  return {
    async create(t, now) {
      const created = await prisma.ticket.create({
        data: {
          userId: t.userId,
          nickname: t.nickname,
          type: t.type,
          priority: t.priority,
          message: t.message,
          client: t.client as Prisma.InputJsonValue,
          ...(t.server ? { server: t.server as Prisma.InputJsonValue } : {}),
          createdAt: new Date(now),
        },
      });
      if (t.screenshot)
        await prisma.ticketScreenshot.create({
          data: { ticketId: created.id, mime: t.screenshot.mime, data: t.screenshot.data },
        });
      return toDetail(created, !!t.screenshot);
    },
    async list(filter, limit) {
      const rows = await prisma.ticket.findMany({
        where: where(filter),
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          userId: true,
          nickname: true,
          type: true,
          priority: true,
          status: true,
          message: true,
          createdAt: true,
          updatedAt: true,
          adminNote: true,
          claudeNote: true,
          // (only the screen and game of the context, not the whole JSON, would be nicer: Prisma cannot select
          // JSON paths, and the lists are short, so the client is read)
          client: true,
        },
      });
      const withShot = new Set(
        (
          await prisma.ticketScreenshot.findMany({
            where: { ticketId: { in: rows.map((r) => r.id) } },
            select: { ticketId: true },
          })
        ).map((s) => s.ticketId),
      );
      return rows.map((r) => row(toDetail({ ...r, server: null }, withShot.has(r.id))));
    },
    async get(id) {
      const t = await prisma.ticket.findUnique({ where: { id } });
      if (!t) return null;
      const shot = await prisma.ticketScreenshot.findUnique({
        where: { ticketId: id },
        select: { ticketId: true },
      });
      return toDetail(t, !!shot);
    },
    async screenshot(id) {
      const s = await prisma.ticketScreenshot.findUnique({ where: { ticketId: id } });
      return s ? { mime: s.mime, data: Buffer.from(s.data) } : null;
    },
    async patch(id, patch, now) {
      const t = await prisma.ticket
        .update({
          where: { id },
          data: {
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.priority ? { priority: patch.priority } : {}),
            ...(patch.adminNote !== undefined ? { adminNote: patch.adminNote } : {}),
            ...(patch.claudeNote !== undefined ? { claudeNote: patch.claudeNote } : {}),
            updatedAt: new Date(now),
          },
        })
        .catch(() => null);
      if (!t) return null;
      const shot = await prisma.ticketScreenshot.findUnique({
        where: { ticketId: id },
        select: { ticketId: true },
      });
      return toDetail(t, !!shot);
    },
    countSince: (userId, since) =>
      prisma.ticket.count({ where: { userId, createdAt: { gte: new Date(since) } } }),
    async purgeDone(before) {
      const old = await prisma.ticket.findMany({
        where: { status: { in: DONE }, updatedAt: { lt: new Date(before) } },
        select: { id: true },
      });
      const ids = old.map((o) => o.id);
      if (ids.length === 0) return 0;
      await prisma.ticketScreenshot.deleteMany({ where: { ticketId: { in: ids } } });
      await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
      return ids.length;
    },
  };
}
