import { timingSafeEqual } from 'node:crypto';
import { mailFailure } from '../errors';
import type { FastifyInstance } from 'fastify';
import {
  deleteAccountSchema,
  loginSchema,
  mergeSchema,
  registerStartSchema,
  registerVerifySchema,
  resetStartSchema,
  resetVerifySchema,
} from '@pogo/shared';
import type { AuthResponse } from '@pogo/shared';
import type { ZodTypeAny, z } from 'zod';
import { hashCode, hashPassword, newCode, verifyPassword } from '../auth/passwords';
import type { TokenService } from '../auth/tokens';
import { isStaff } from '@pogo/shared';
import type { PublicUser } from '@pogo/shared';
import { banMessage } from '../admin/moderation';
import type { BanList } from '../admin/moderation';
import type { CodePurpose, UserStore } from '../auth/userStore';
import { codeMail } from '../mail/template';
import type { LogMailer, Mailer } from '../mail/mailer';
import { authenticate } from './authRoutes';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
export const MAX_AVATAR_BYTES = 80_000;
/** Looks like nothing real, so a login for an unknown email costs the same as a wrong password. */
const DUMMY_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

export interface AccountDeps {
  users: UserStore;
  tokens: TokenService;
  mailer: Mailer;
  /** Secret that keys the code hashes. */
  secret: string;
  /** Expose GET /api/dev/last-mail (tests and local development only). */
  devMailbox?: LogMailer;
  now?: () => number;
  /** Multiplies the per-minute request limits (tests and local development are far busier than production). */
  limitScale?: number;
  /** Bans: a banned account cannot log in (an IP ban also stops everyone but staff). */
  bans?: BanList;
  /** Emails that become admin when they register or log in (the first admin of a new install). */
  adminEmails?: string[];
}

function imageKind(buf: Buffer): string | null {
  if (buf.length > 12 && buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return 'image/jpeg';
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function registerAccountRoutes(app: FastifyInstance, deps: AccountDeps) {
  const { users, tokens, mailer } = deps;
  /** The first admin: a listed email gets the admin role as soon as it registers or logs in. */
  const withBootstrapRole = async (user: PublicUser): Promise<PublicUser> => {
    if (user.role === 'admin' || !user.email || !deps.adminEmails?.includes(user.email))
      return user;
    return (await users.setRole(user.id, 'admin')) ?? user;
  };
  const now = deps.now ?? Date.now;
  const tight = (max: number) => ({
    config: { rateLimit: { max: max * (deps.limitScale ?? 1), timeWindow: '1 minute' } },
  });

  const parse = <T extends ZodTypeAny>(schema: T, body: unknown) => {
    const parsed = schema.safeParse(body);
    return parsed.success
      ? ({ ok: true, data: parsed.data as z.output<T> } as const)
      : ({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const);
  };

  async function sendCode(email: string, purpose: CodePurpose, userId: string | null) {
    const code = newCode();
    await users.putCode(email, purpose, {
      codeHash: hashCode(deps.secret, email, code),
      userId,
      expiresAt: now() + CODE_TTL_MS,
    });
    try {
      await mailer.send(codeMail(email, purpose, code));
    } catch (err) {
      throw mailFailure(err); // logged by the error handler with its code and a ref
    }
  }

  /** Checks a code; every wrong guess counts, and a used or expired code is gone. */
  async function checkCode(email: string, purpose: CodePurpose, code: string) {
    const record = await users.getCode(email, purpose);
    if (!record || record.expiresAt < now() || record.attempts >= MAX_CODE_ATTEMPTS) return null;
    if (!safeEqual(record.codeHash, hashCode(deps.secret, email, code))) {
      await users.bumpCodeAttempts(email, purpose);
      return null;
    }
    await users.deleteCode(email, purpose);
    return record;
  }

  app.post('/api/account/register/start', tight(5), async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    if (!me.isGuest) return reply.code(400).send({ error: 'You already have an account' });
    const input = parse(registerStartSchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    if (await users.getByEmail(input.data.email)) {
      return reply.code(409).send({ error: 'That email already has an account. Log in instead.' });
    }
    await sendCode(input.data.email, 'register', me.id);
    return { ok: true };
  });

  app.post('/api/account/register/verify', tight(10), async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    const input = parse(registerVerifySchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    const { email, code, password } = input.data;
    const record = await checkCode(email, 'register', code);
    if (!record || record.userId !== me.id) {
      return reply.code(400).send({ error: 'That code is wrong or has expired' });
    }
    const result = await users.register(me.id, email, await hashPassword(password));
    if (result === 'taken')
      return reply.code(409).send({ error: 'That email already has an account' });
    if (!result) return reply.code(404).send({ error: 'Not signed in' });
    return { user: await withBootstrapRole(result) };
  });

  app.post('/api/auth/login', tight(10), async (req, reply) => {
    const input = parse(loginSchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    const found = await users.getByEmail(input.data.email);
    const ok = await verifyPassword(input.data.password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !found.passwordHash || !ok) {
      return reply.code(401).send({ error: 'Wrong email or password' });
    }
    const user = await withBootstrapRole(found.user);
    const ban = deps.bans?.forUser(user.id) ?? (isStaff(user) ? null : deps.bans?.forIp(req.ip));
    if (ban) return reply.code(403).send({ error: banMessage(ban), banned: true });
    const body: AuthResponse = { token: await tokens.sign(user.id), user };
    return body;
  });

  app.post('/api/auth/reset/start', tight(5), async (req, reply) => {
    const input = parse(resetStartSchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    const found = await users.getByEmail(input.data.email);
    // Same answer whether or not the address has an account.
    if (found?.passwordHash) await sendCode(input.data.email, 'reset', found.user.id);
    return { ok: true };
  });

  app.post('/api/auth/reset/verify', tight(10), async (req, reply) => {
    const input = parse(resetVerifySchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    const { email, code, password } = input.data;
    const record = await checkCode(email, 'reset', code);
    if (!record?.userId)
      return reply.code(400).send({ error: 'That code is wrong or has expired' });
    await users.setPassword(record.userId, await hashPassword(password));
    return { ok: true };
  });

  // After logging in on a device that had a guest: take that guest's games over.
  app.post('/api/account/merge', tight(10), async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me || me.isGuest) return reply.code(401).send({ error: 'Not signed in' });
    const input = parse(mergeSchema, req.body);
    if (!input.ok) return reply.code(400).send({ error: input.error });
    const guestId = await tokens.verify(input.data.guestToken);
    const guest = guestId ? await users.get(guestId) : null;
    // Only ever absorb a guest: a registered account must never be deleted this way.
    if (!guest || !guest.isGuest || guest.id === me.id) {
      return reply.code(400).send({ error: 'Nothing to merge' });
    }
    return { moved: await users.mergeInto(guest.id, me.id) };
  });

  // ---- profile picture ----
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: MAX_AVATAR_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.put('/api/me/avatar', tight(10), async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    if (me.isGuest) return reply.code(403).send({ error: 'Register to upload a picture' });
    const body = req.body;
    const mime = Buffer.isBuffer(body) ? imageKind(body) : null;
    if (!Buffer.isBuffer(body) || !mime) {
      return reply.code(400).send({ error: 'Please upload a JPEG, PNG or WebP image' });
    }
    const user = await users.setImage(me.id, { mime, data: body });
    return { user };
  });

  app.delete('/api/me/avatar', async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    return { user: await users.clearImage(me.id, 'fox') };
  });

  app.get<{ Params: { id: string } }>('/api/users/:id/avatar', async (req, reply) => {
    const image = await users.getImage(req.params.id);
    if (!image) return reply.code(404).send({ error: 'No picture' });
    return reply
      .header('content-type', image.mime)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(image.data);
  });

  app.delete('/api/me', tight(5), async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    if (!me.isGuest) {
      const input = parse(deleteAccountSchema, req.body);
      if (!input.ok) return reply.code(400).send({ error: input.error });
      const stored = await users.passwordHashOf(me.id);
      if (!stored || !(await verifyPassword(input.data.password, stored))) {
        return reply.code(401).send({ error: 'Wrong password' });
      }
    }
    await users.delete(me.id);
    return { ok: true };
  });

  // ---- stats ----
  app.get('/api/me/stats', async (req, reply) => {
    const me = await authenticate(req, tokens, users);
    if (!me) return reply.code(401).send({ error: 'Not signed in' });
    return { stats: await users.statsFor(me.id) };
  });

  app.get<{ Querystring: { game?: string } }>('/api/leaderboard', async (req, reply) => {
    const game = req.query.game ?? '';
    if (!/^[a-z0-9-]{1,30}$/.test(game)) return reply.code(400).send({ error: 'Unknown game' });
    return { entries: await users.leaderboard(game, 50) };
  });

  if (deps.devMailbox) {
    const mailbox = deps.devMailbox;
    app.get<{ Querystring: { to?: string } }>('/api/dev/last-mail', async (req, reply) => {
      const mail = mailbox.last(req.query.to ?? '');
      if (!mail) return reply.code(404).send({ error: 'No mail' });
      return { ...mail, code: /\b(\d{6})\b/.exec(mail.text)?.[1] ?? null };
    });
  }
}
