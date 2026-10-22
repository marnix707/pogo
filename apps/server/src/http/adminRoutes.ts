import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  MODERATOR_MAX_BAN_MINUTES,
  banSchema,
  devSchema,
  displayName,
  isStaff,
  roleRank,
  roleSchema,
  titlesSchema,
} from '@pogo/shared';
import type { AdminAuditRow, AdminBanRow, AdminUserRow, PublicUser } from '@pogo/shared';
import type { BanList, BanRecord, ModerationStore } from '../admin/moderation';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';
import type { RoomManager } from '../rooms/RoomManager';
import { authenticate } from './authRoutes';

export interface AdminDeps {
  users: UserStore;
  tokens: TokenService;
  bans: BanList;
  moderation: ModerationStore;
  manager: RoomManager;
  /** Close every socket of this user (after a ban). */
  disconnectUser: (userId: string) => void;
  isOnline: (userId: string) => boolean;
  now?: () => number;
}

const toBanRow = (b: BanRecord): AdminBanRow => ({
  id: b.id,
  userId: b.userId,
  nickname: b.nickname,
  ip: b.ip,
  reason: b.reason,
  byName: b.byName,
  createdAt: b.createdAt,
  expiresAt: b.expiresAt,
});

/** The admin panel's API (`/api/admin/*`): moderators kick and ban for a while, admins do everything. */
export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps) {
  const { users, tokens, bans, moderation, manager } = deps;
  const now = deps.now ?? Date.now;

  /** The signed-in staff member, or a 403 already sent. */
  async function staff(req: FastifyRequest, reply: FastifyReply): Promise<PublicUser | null> {
    const me = await authenticate(req, tokens, users);
    if (!me) {
      void reply.code(401).send({ error: 'Not signed in' });
      return null;
    }
    if (!isStaff(me)) {
      void reply.code(403).send({ error: 'No access' });
      return null;
    }
    return me;
  }

  const log = (actor: PublicUser, action: string, target: PublicUser | null, detail = '') =>
    moderation.addAudit(
      {
        actorId: actor.id,
        actorName: displayName(actor),
        action,
        targetId: target?.id ?? null,
        targetName: target ? displayName(target) : '',
        detail,
      },
      now(),
    );

  const limits = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };
  const idParam = (req: FastifyRequest) => String((req.params as { id?: string }).id ?? '');

  app.get('/api/admin/me', limits, async (req, reply) => {
    const me = await staff(req, reply);
    return me ? { user: me } : undefined;
  });

  app.get('/api/admin/users', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    const q = String((req.query as { q?: string }).q ?? '').slice(0, 60);
    const found = await users.search(q, 50);
    const rows: AdminUserRow[] = found.map(({ user, createdAt, lastSeenAt }) => {
      const ban = bans.forUser(user.id);
      return {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        isGuest: user.isGuest,
        ...(me.role === 'admin' && user.email ? { email: user.email } : {}),
        role: user.role ?? 'user',
        isDev: !!user.isDev,
        prefix: user.prefix ?? '',
        suffix: user.suffix ?? '',
        createdAt,
        lastSeenAt,
        online: deps.isOnline(user.id),
        roomCode: manager.roomCodeOf(user.id),
        ban: ban ? toBanRow(ban) : null,
      };
    });
    return { users: rows };
  });

  app.get('/api/admin/rooms', limits, async (req, reply) => {
    if (!(await staff(req, reply))) return;
    return { rooms: manager.listAll() };
  });

  app.get('/api/admin/bans', limits, async (req, reply) => {
    if (!(await staff(req, reply))) return;
    return { bans: bans.list().map(toBanRow) };
  });

  app.get('/api/admin/audit', limits, async (req, reply) => {
    if (!(await staff(req, reply))) return;
    const rows: AdminAuditRow[] = (await moderation.recentAudit(100)).map((r) => ({
      id: r.id,
      at: r.at,
      actorName: r.actorName,
      action: r.action,
      targetName: r.targetName,
      detail: r.detail,
    }));
    return { audit: rows };
  });

  /** Loads the target of an action; staff may only act on people ranked below themselves. */
  async function target(me: PublicUser, req: FastifyRequest, reply: FastifyReply) {
    const user = await users.get(idParam(req));
    if (!user) {
      void reply.code(404).send({ error: 'Player not found' });
      return null;
    }
    if (user.id === me.id) {
      void reply.code(400).send({ error: 'You cannot do that to yourself' });
      return null;
    }
    if (roleRank(user.role) >= roleRank(me.role)) {
      void reply
        .code(403)
        .send({ error: 'You cannot act on someone of the same or a higher rank' });
      return null;
    }
    return user;
  }

  app.post('/api/admin/users/:id/kick', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    const user = await target(me, req, reply);
    if (!user) return;
    const was = manager.evict(user.id);
    await log(me, 'kick', user, was ? 'removed from their room' : 'was not in a room');
    return { ok: true, wasInRoom: was };
  });

  app.post('/api/admin/users/:id/ban', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    const user = await target(me, req, reply);
    if (!user) return;
    const parsed = banSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { minutes, reason, blockIp } = parsed.data;
    if (me.role !== 'admin' && (minutes === null || minutes > MODERATOR_MAX_BAN_MINUTES)) {
      return reply.code(403).send({ error: 'Moderators can ban for 7 days at most' });
    }
    const ban = await bans.add({
      userId: user.id,
      nickname: displayName(user),
      ip: blockIp ? await users.lastIpOf(user.id) : null,
      reason,
      byId: me.id,
      byName: displayName(me),
      createdAt: now(),
      expiresAt: minutes === null ? null : now() + minutes * 60_000,
    });
    manager.evict(user.id);
    deps.disconnectUser(user.id);
    await log(
      me,
      'ban',
      user,
      `${minutes === null ? 'permanent' : `${minutes} min`}${reason ? `: ${reason}` : ''}`,
    );
    return { ban: toBanRow(ban) };
  });

  app.delete('/api/admin/bans/:id', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    const lifted = await bans.revoke(idParam(req));
    if (!lifted) return reply.code(404).send({ error: 'That ban is not active' });
    await log(me, 'unban', null, lifted.nickname);
    return { ok: true };
  });

  app.post('/api/admin/users/:id/role', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    if (me.role !== 'admin') return reply.code(403).send({ error: 'Only admins can change roles' });
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid role' });
    const user = await users.get(idParam(req));
    if (!user) return reply.code(404).send({ error: 'Player not found' });
    if (user.id === me.id)
      return reply.code(400).send({ error: 'You cannot change your own role' });
    if (user.isGuest && parsed.data.role !== 'user') {
      return reply
        .code(400)
        .send({ error: 'Staff needs a registered account (to log in to the panel)' });
    }
    const updated = await users.setRole(user.id, parsed.data.role);
    await log(me, 'role', user, `${user.role ?? 'user'} -> ${parsed.data.role}`);
    return { user: updated };
  });

  app.post('/api/admin/users/:id/dev', limits, async (req, reply) => {
    const me = await staff(req, reply);
    if (!me) return;
    if (me.role !== 'admin')
      return reply.code(403).send({ error: 'Only admins can give the dev tag' });
    const parsed = devSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const user = await users.get(idParam(req));
    if (!user) return reply.code(404).send({ error: 'Player not found' });
    const updated = await users.setDev(user.id, parsed.data.isDev);
    await log(me, parsed.data.isDev ? 'dev-on' : 'dev-off', user);
    return { user: updated };
  });

  /** Developers only: the titles page. */
  async function developer(req: FastifyRequest, reply: FastifyReply): Promise<PublicUser | null> {
    const me = await staff(req, reply);
    if (!me) return null;
    if (!me.isDev) {
      void reply.code(403).send({ error: 'Only developers can do this' });
      return null;
    }
    return me;
  }

  app.get('/api/admin/titles', limits, async (req, reply) => {
    if (!(await developer(req, reply))) return;
    const q = String((req.query as { q?: string }).q ?? '').slice(0, 60);
    const found = await users.listRegistered(q, 100);
    return {
      users: found.map(({ user, createdAt, lastSeenAt }) => ({
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        email: user.email ?? '',
        isDev: !!user.isDev,
        prefix: user.prefix ?? '',
        suffix: user.suffix ?? '',
        createdAt,
        lastSeenAt,
        online: deps.isOnline(user.id),
      })),
    };
  });

  app.post('/api/admin/users/:id/titles', limits, async (req, reply) => {
    const me = await developer(req, reply);
    if (!me) return;
    const parsed = titlesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const user = await users.get(idParam(req));
    if (!user) return reply.code(404).send({ error: 'Player not found' });
    if (user.isGuest)
      return reply.code(400).send({ error: 'Only registered players can get titles' });
    const { prefix, suffix } = parsed.data;
    const updated = await users.setTitles(user.id, prefix, suffix);
    await log(me, 'titles', user, `prefix "${prefix}", suffix "${suffix}"`);
    return { user: updated };
  });
}
