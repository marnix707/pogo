import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  FRIENDS_MAX,
  PENDING_MAX,
  chatSendSchema,
  displayName,
  friendRequestSchema,
  roomInviteSchema,
} from '@pogo/shared';
import type {
  DirectMessageView,
  FriendRequestView,
  FriendState,
  FriendView,
  FriendsOverview,
  GameInviteView,
  PersonView,
  ProfileView,
  PublicUser,
} from '@pogo/shared';
import { createRateLimiter } from '../socket/rateLimit';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';
import type { FriendStore } from '../social/friendStore';
import { authenticate } from './authRoutes';

export interface FriendDeps {
  users: UserStore;
  friends: FriendStore;
  tokens: TokenService;
  /** Where a player is right now (room code, game, status). */
  roomInfoOf: (
    userId: string,
  ) => { code: string; gameId: string; status: 'lobby' | 'playing' | 'finished' } | null;
  isOnline: (userId: string) => boolean;
  /** Push a realtime event to all sockets of a user. */
  push: {
    update: (userId: string) => void;
    message: (userId: string, message: DirectMessageView) => void;
    invite: (userId: string, invite: GameInviteView) => void;
  };
  /** The profanity mask (identity when the filter is off). */
  maskText: (text: string) => string;
  /** Multiplies the per-minute limits (tests and local development are busier than production). */
  limitScale?: number;
  now?: () => number;
}

const person = (u: PublicUser): PersonView => ({
  id: u.id,
  name: displayName(u),
  avatar: u.avatar,
});

/** Friends, requests, blocks, mutes, private messages and game invites (registered players only). */
export function registerFriendRoutes(app: FastifyInstance, deps: FriendDeps) {
  const { users, friends, tokens } = deps;
  const scale = deps.limitScale ?? 1;
  const tight = (max: number) => ({
    config: { rateLimit: { max: max * scale, timeWindow: '1 minute' } },
  });
  const now = deps.now ?? Date.now;

  /** The signed-in registered player, or a 401/403 already sent. */
  async function registered(req: FastifyRequest, reply: FastifyReply): Promise<PublicUser | null> {
    const me = await authenticate(req, tokens, users);
    if (!me) {
      void reply.code(401).send({ error: 'Not signed in' });
      return null;
    }
    if (me.isGuest) {
      void reply.code(403).send({ error: 'Register to use friends' });
      return null;
    }
    return me;
  }
  const idParam = (req: FastifyRequest) => String((req.params as { id?: string }).id ?? '');

  /** Another registered player by id, or a 404 already sent. */
  async function otherUser(req: FastifyRequest, reply: FastifyReply, me: PublicUser) {
    const id = idParam(req);
    const other = id && id !== me.id ? await users.get(id) : null;
    if (!other || other.isGuest) {
      void reply.code(404).send({ error: 'Player not found' });
      return null;
    }
    return other;
  }

  async function isBlockedEitherWay(a: string, b: string) {
    const [mine, theirs] = await Promise.all([friends.blockedBy(a), friends.blockersOf(a)]);
    return mine.includes(b) || theirs.includes(b);
  }

  async function stateOf(me: string, other: string): Promise<FriendState> {
    if ((await friends.blockedBy(me)).includes(other)) return 'blocked';
    if ((await friends.blockersOf(me)).includes(other)) return 'blockedBy';
    const f = await friends.friendship(me, other);
    if (!f) return 'none';
    if (f.status === 'accepted') return 'friends';
    return f.requestedBy === me ? 'outgoing' : 'incoming';
  }

  const both = (a: string, b: string) => {
    deps.push.update(a);
    deps.push.update(b);
  };

  // ---- the lists -------------------------------------------------------------------------------
  app.get('/api/friends', tight(60), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const [rows, blockedIds, mutedIds, unread, code] = await Promise.all([
      friends.listFriendships(me.id),
      friends.blockedBy(me.id),
      friends.mutedBy(me.id),
      friends.unreadCounts(me.id),
      friends.codeOf(me.id),
    ]);
    const muted = new Set(mutedIds);
    const load = async (ids: string[]) =>
      (await Promise.all(ids.map((id) => users.get(id)))).filter((u): u is PublicUser => !!u);
    const accepted = rows.filter((r) => r.status === 'accepted');
    const byId = new Map((await load(rows.map((r) => r.otherId))).map((u) => [u.id, u]));
    const friendViews: FriendView[] = accepted.flatMap((r) => {
      const u = byId.get(r.otherId);
      if (!u) return [];
      const info = deps.roomInfoOf(u.id);
      return [
        {
          ...person(u),
          online: deps.isOnline(u.id),
          room: info ? { gameId: info.gameId, status: info.status } : null,
          unread: muted.has(u.id) ? 0 : (unread.get(u.id) ?? 0),
          muted: muted.has(u.id),
        },
      ];
    });
    const requests = (mine: boolean): FriendRequestView[] =>
      rows
        .filter((r) => r.status === 'pending' && (r.requestedBy === me.id) === mine)
        .flatMap((r) => {
          const u = byId.get(r.otherId);
          return u ? [{ ...person(u), createdAt: r.createdAt }] : [];
        });
    const overview: FriendsOverview = {
      friends: friendViews.sort(
        (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
      ),
      incoming: requests(false),
      outgoing: requests(true),
      code,
      blocked: (await load(blockedIds)).map(person),
    };
    return overview;
  });

  // ---- requests --------------------------------------------------------------------------------
  app.post('/api/friends/request', tight(20), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const input = friendRequestSchema.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid request' });
    const targetId = input.data.userId ?? (await friends.userIdByCode(input.data.code!));
    if (targetId === me.id) return reply.code(400).send({ error: 'You cannot add yourself' });
    const target = targetId ? await users.get(targetId) : null;
    if (!target || target.isGuest) return reply.code(404).send({ error: 'Player not found' });
    if (await isBlockedEitherWay(me.id, target.id))
      return reply.code(403).send({ error: 'You cannot add this player' });
    const existing = await friends.friendship(me.id, target.id);
    if (existing?.status === 'accepted')
      return reply.code(409).send({ error: 'You are already friends' });
    if (existing?.status === 'pending' && existing.requestedBy === me.id)
      return { state: 'outgoing' };
    const rows = await friends.listFriendships(me.id);
    const pending = rows.filter((r) => r.status === 'pending' && r.requestedBy === me.id).length;
    if (rows.filter((r) => r.status === 'accepted').length >= FRIENDS_MAX || pending >= PENDING_MAX)
      return reply.code(409).send({ error: 'Too many friends or open requests' });
    if (existing?.status === 'pending') {
      // They had already asked me: asking back makes us friends.
      await friends.accept(me.id, target.id);
      both(me.id, target.id);
      return { state: 'friends' };
    }
    await friends.createRequest(me.id, target.id);
    both(me.id, target.id);
    return { state: 'outgoing' };
  });

  app.post('/api/friends/:id/accept', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    const f = await friends.friendship(me.id, other.id);
    if (f?.status !== 'pending' || f.requestedBy !== other.id)
      return reply.code(404).send({ error: 'There is no such friend request' });
    await friends.accept(me.id, other.id);
    both(me.id, other.id);
    return { state: 'friends' };
  });

  /** Decline an incoming request, or cancel my own. */
  app.post('/api/friends/:id/decline', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    const f = await friends.friendship(me.id, other.id);
    if (f?.status !== 'pending')
      return reply.code(404).send({ error: 'There is no such friend request' });
    await friends.remove(me.id, other.id);
    both(me.id, other.id);
    return { state: 'none' };
  });

  app.delete('/api/friends/:id', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    const f = await friends.friendship(me.id, other.id);
    if (f?.status !== 'accepted') return reply.code(404).send({ error: 'You are not friends' });
    await friends.remove(me.id, other.id);
    both(me.id, other.id);
    return { state: 'none' };
  });

  app.post('/api/friends/code/regenerate', tight(5), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    return { code: await friends.regenerateCode(me.id) };
  });

  // ---- find and look at people -------------------------------------------------------------------
  app.get('/api/users/search', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const q = String((req.query as { q?: string }).q ?? '')
      .trim()
      .slice(0, 30)
      .toLowerCase();
    if (q.length < 2) return { users: [] };
    const hidden = new Set([
      ...(await friends.blockedBy(me.id)),
      ...(await friends.blockersOf(me.id)),
      me.id,
    ]);
    // (The admin search also matches e-mail addresses: only the nickname may count here.)
    const found = await users.listRegistered(q, 60);
    const out: (PersonView & { state: FriendState })[] = [];
    for (const { user } of found) {
      if (hidden.has(user.id) || user.isGuest || !user.nickname.toLowerCase().includes(q)) continue;
      out.push({ ...person(user), state: await stateOf(me.id, user.id) });
      if (out.length >= 10) break;
    }
    return { users: out };
  });

  app.get('/api/users/:id/profile', tight(60), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const id = idParam(req);
    const user = id ? await users.get(id) : null;
    if (!user || (await friends.blockersOf(me.id)).includes(user.id))
      return reply.code(404).send({ error: 'Player not found' });
    const stats = user.isGuest ? [] : await users.statsFor(user.id);
    const profile: ProfileView = {
      ...person(user),
      isGuest: user.isGuest,
      stats: stats.map((s) => ({
        gameId: s.gameId,
        games: s.games,
        wins: s.wins,
        bestScore: s.bestScore,
      })),
      state: user.id === me.id ? 'none' : await stateOf(me.id, user.id),
      muted: (await friends.mutedBy(me.id)).includes(user.id),
      online: deps.isOnline(user.id),
    };
    return profile;
  });

  // The games you played with this person: how many, who won, which games most.
  app.get('/api/users/:id/together', tight(60), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const id = idParam(req);
    const user = id ? await users.get(id) : null;
    if (!user || (await friends.blockersOf(me.id)).includes(user.id))
      return reply.code(404).send({ error: 'Player not found' });
    return await users.together(me.id, user.id);
  });

  // ---- block and mute ------------------------------------------------------------------------------
  app.post('/api/users/:id/block', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    await friends.block(me.id, other.id);
    await friends.remove(me.id, other.id); // no friendship (or request) survives a block
    both(me.id, other.id);
    return { state: 'blocked' };
  });
  app.post('/api/users/:id/unblock', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    await friends.unblock(me.id, other.id);
    deps.push.update(me.id);
    return { state: 'none' };
  });
  app.post('/api/users/:id/mute', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    await friends.mute(me.id, other.id);
    deps.push.update(me.id);
    return { muted: true };
  });
  app.post('/api/users/:id/unmute', tight(30), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    await friends.unmute(me.id, other.id);
    deps.push.update(me.id);
    return { muted: false };
  });

  // ---- private messages ---------------------------------------------------------------------------------
  const limiters = new Map<string, { allow: () => boolean; at: number }>();
  const mayWrite = (userId: string) => {
    let e = limiters.get(userId);
    if (!e) {
      if (limiters.size > 5000) limiters.clear();
      e = { allow: createRateLimiter(5, 0.5), at: 0 };
      limiters.set(userId, e);
    }
    e.at = now();
    return e.allow();
  };

  /** A friend (accepted, not blocked) by id, or the error already sent. */
  async function friendOf(req: FastifyRequest, reply: FastifyReply, me: PublicUser) {
    const other = await otherUser(req, reply, me);
    if (!other) return null;
    const f = await friends.friendship(me.id, other.id);
    if (f?.status !== 'accepted' || (await isBlockedEitherWay(me.id, other.id))) {
      void reply.code(403).send({ error: 'You cannot message this player' });
      return null;
    }
    return other;
  }

  app.get('/api/messages/:id', tight(60), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await friendOf(req, reply, me);
    if (!other) return;
    const before = Number((req.query as { before?: string }).before);
    const list = await friends.messages(
      me.id,
      other.id,
      Number.isFinite(before) ? before : undefined,
      50,
    );
    return { messages: list as DirectMessageView[] };
  });

  app.post('/api/messages/:id', tight(60), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await friendOf(req, reply, me);
    if (!other) return;
    const parsed = chatSendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    if (!mayWrite(me.id))
      return reply.code(429).send({ error: 'You are sending messages too fast' });
    const stored = await friends.addMessage(me.id, other.id, deps.maskText(parsed.data.text));
    // My other tabs see it too; a recipient who muted me gets it stored but is not pushed.
    deps.push.message(me.id, stored);
    if (!(await friends.mutedBy(other.id)).includes(me.id)) deps.push.message(other.id, stored);
    return { message: stored as DirectMessageView };
  });

  app.post('/api/messages/:id/read', tight(120), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await otherUser(req, reply, me);
    if (!other) return;
    await friends.markRead(me.id, other.id);
    deps.push.update(me.id);
    return { ok: true };
  });

  // ---- game invites -----------------------------------------------------------------------------------------
  app.post('/api/friends/:id/invite', tight(10), async (req, reply) => {
    const me = await registered(req, reply);
    if (!me) return;
    const other = await friendOf(req, reply, me);
    if (!other) return;
    const input = roomInviteSchema.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid request' });
    const info = deps.roomInfoOf(me.id);
    if (!info || info.code !== input.data.roomCode || info.status !== 'lobby')
      return reply.code(409).send({ error: 'You are not in a lobby' });
    if (!(await friends.mutedBy(other.id)).includes(me.id))
      deps.push.invite(other.id, { from: person(me), roomCode: info.code, gameId: info.gameId });
    return { ok: true };
  });
}
