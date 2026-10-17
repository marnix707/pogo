import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { PublicUser } from '@pogo/shared';

export interface UserStore {
  createGuest(profile: { nickname: string; avatar: string }): Promise<PublicUser>;
  get(id: string): Promise<PublicUser | null>;
  updateProfile(
    id: string,
    profile: { nickname: string; avatar: string },
  ): Promise<PublicUser | null>;
}

export function createPrismaUserStore(prisma: PrismaClient): UserStore {
  const toPublic = (u: { id: string; nickname: string; avatar: string; isGuest: boolean }) => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    isGuest: u.isGuest,
  });
  return {
    createGuest: async (profile) => toPublic(await prisma.user.create({ data: profile })),
    get: async (id) => {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toPublic(user) : null;
    },
    updateProfile: async (id, profile) => {
      try {
        return toPublic(await prisma.user.update({ where: { id }, data: profile }));
      } catch {
        return null;
      }
    },
  };
}

/** In-memory store for tests. */
export function createMemoryUserStore(): UserStore {
  const users = new Map<string, PublicUser>();
  return {
    async createGuest(profile) {
      const user: PublicUser = { id: randomUUID(), isGuest: true, ...profile };
      users.set(user.id, user);
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
  };
}
