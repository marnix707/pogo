import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface BanRecord {
  id: string;
  userId: string | null;
  nickname: string;
  ip: string | null;
  reason: string;
  byId: string;
  byName: string;
  createdAt: number;
  /** null = permanent. */
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface AuditRecord {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string | null;
  targetName: string;
  detail: string;
}

/** Persistence for bans and the staff action log (Prisma in production, memory in tests). */
export interface ModerationStore {
  /** Bans that are neither lifted nor expired (loaded at start-up). */
  activeBans(now: number): Promise<BanRecord[]>;
  addBan(ban: Omit<BanRecord, 'id' | 'revokedAt'>): Promise<BanRecord>;
  revokeBan(id: string, now: number): Promise<void>;
  addAudit(entry: Omit<AuditRecord, 'id' | 'at'>, at: number): Promise<void>;
  recentAudit(limit: number): Promise<AuditRecord[]>;
}

export function createMemoryModerationStore(): ModerationStore {
  const bans: BanRecord[] = [];
  const audit: AuditRecord[] = [];
  return {
    activeBans: async (now) =>
      bans.filter((b) => !b.revokedAt && (b.expiresAt === null || b.expiresAt > now)),
    async addBan(ban) {
      const record = { ...ban, id: randomUUID(), revokedAt: null };
      bans.push(record);
      return record;
    },
    async revokeBan(id, now) {
      const b = bans.find((x) => x.id === id);
      if (b) b.revokedAt = now;
    },
    async addAudit(entry, at) {
      audit.push({ ...entry, id: randomUUID(), at });
    },
    recentAudit: async (limit) => audit.slice(-limit).reverse(),
  };
}

export function createPrismaModerationStore(prisma: PrismaClient): ModerationStore {
  const toBan = (b: {
    id: string;
    userId: string | null;
    nickname: string;
    ip: string | null;
    reason: string;
    byId: string;
    byName: string;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }): BanRecord => ({
    ...b,
    createdAt: b.createdAt.getTime(),
    expiresAt: b.expiresAt?.getTime() ?? null,
    revokedAt: b.revokedAt?.getTime() ?? null,
  });
  return {
    async activeBans(now) {
      const rows = await prisma.ban.findMany({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }] },
      });
      return rows.map(toBan);
    },
    async addBan(ban) {
      return toBan(
        await prisma.ban.create({
          data: {
            ...ban,
            createdAt: new Date(ban.createdAt),
            expiresAt: ban.expiresAt ? new Date(ban.expiresAt) : null,
          },
        }),
      );
    },
    async revokeBan(id, now) {
      await prisma.ban
        .update({ where: { id }, data: { revokedAt: new Date(now) } })
        .catch(() => undefined);
    },
    async addAudit(entry, at) {
      await prisma.auditLog.create({ data: { ...entry, at: new Date(at) } });
    },
    async recentAudit(limit) {
      const rows = await prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: limit });
      return rows.map((r) => ({ ...r, at: r.at.getTime() }));
    },
  };
}

/**
 * The live ban list: loaded once at start-up and kept in step with the store, so checking a
 * request or a socket never touches the database (single-instance server).
 */
export class BanList {
  private bans: BanRecord[] = [];

  constructor(
    private readonly store: ModerationStore,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    this.bans = await this.store.activeBans(this.now());
  }

  private active(): BanRecord[] {
    const now = this.now();
    return this.bans.filter((b) => !b.revokedAt && (b.expiresAt === null || b.expiresAt > now));
  }

  /** An account ban on this user, if any. */
  forUser(userId: string): BanRecord | null {
    return this.active().find((b) => b.userId === userId) ?? null;
  }

  /** An IP ban on this address, if any. */
  forIp(ip: string | null | undefined): BanRecord | null {
    return ip ? (this.active().find((b) => b.ip === ip) ?? null) : null;
  }

  list(): BanRecord[] {
    return this.active().sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(ban: Omit<BanRecord, 'id' | 'revokedAt'>): Promise<BanRecord> {
    const record = await this.store.addBan(ban);
    this.bans.push(record);
    return record;
  }

  /** Lifts every active ban with this id; returns the lifted ones. */
  async revoke(id: string): Promise<BanRecord | null> {
    const ban = this.active().find((b) => b.id === id);
    if (!ban) return null;
    ban.revokedAt = this.now();
    await this.store.revokeBan(id, ban.revokedAt);
    return ban;
  }
}

/** The message a banned player sees. */
export function banMessage(ban: BanRecord): string {
  const until = ban.expiresAt
    ? `until ${new Date(ban.expiresAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`
    : 'permanently';
  return `You are banned ${until}.${ban.reason ? ` Reason: ${ban.reason}` : ''}`;
}
