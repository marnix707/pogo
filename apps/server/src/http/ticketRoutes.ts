import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  MAX_TICKET_SCREENSHOT_BYTES,
  displayName,
  isStaff,
  ticketCreateSchema,
  ticketPatchSchema,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from '@pogo/shared';
import type { TicketPriority, TicketStatus, TicketType } from '@pogo/shared';
import type { ModerationStore } from '../admin/moderation';
import type { TicketStore } from '../admin/ticketStore';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';
import type { RoomManager } from '../rooms/RoomManager';
import { authenticate } from './authRoutes';

export interface TicketDeps {
  users: UserStore;
  tokens: TokenService;
  tickets: TicketStore;
  manager: RoomManager;
  moderation: ModerationStore;
  /** A secret for Claude Code (the fix-ticket skill): read the tickets and move them along, nothing else. */
  apiToken?: string;
  now?: () => number;
  /** 1 in production; larger in dev and tests so the limits do not get in the way. */
  limitScale?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_DAY = 20;
/** Closed tickets are kept this long. */
const KEEP_DONE_MS = 90 * DAY_MS;

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

/** Removes everything that looks like a secret from what the browser sent (the app never sends them, but still). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|authorization|password|secret|cookie/i.test(k)
        ? '[removed]'
        : redact(v, depth + 1);
    }
    return out;
  }
  return typeof value === 'string' && value.length > 5000 ? `${value.slice(0, 5000)}…` : value;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** `POST /api/tickets` for everybody who is signed in (guests too) and `/api/admin/tickets*` for the admin panel. */
export function registerTicketRoutes(app: FastifyInstance, deps: TicketDeps) {
  const { users, tokens, tickets, manager, moderation } = deps;
  const now = deps.now ?? Date.now;
  const scale = deps.limitScale ?? 1;
  const adminLimits = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  app.post(
    '/api/tickets',
    {
      // a screenshot as base64 plus the captured state: bigger than Fastify's 1 MB default is not needed
      bodyLimit: 900_000,
      config: { rateLimit: { max: 5 * scale, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const me = await authenticate(req, tokens, users);
      if (!me) return reply.code(401).send({ error: 'Not signed in' });
      const parsed = ticketCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        const onMessage = parsed.error.issues.some((i) => i.path[0] === 'message');
        return reply
          .code(400)
          .send({
            error: onMessage ? 'Please describe the problem in a few words' : 'Invalid input',
          });
      }
      const input = parsed.data;
      if ((await tickets.countSince(me.id, now() - DAY_MS)) >= MAX_REPORTS_PER_DAY)
        return reply
          .code(429)
          .send({ error: 'You have sent a lot of reports today. Please try again tomorrow.' });
      let screenshot: { mime: string; data: Buffer } | null = null;
      if (input.screenshot) {
        const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.screenshot);
        const data = m ? Buffer.from(m[1]!, 'base64') : null;
        const mime = data ? imageKind(data) : null;
        if (!data || !mime || data.length > MAX_TICKET_SCREENSHOT_BYTES)
          return reply.code(400).send({ error: 'The screenshot is too big or not an image' });
        screenshot = { mime, data };
      }
      const ticket = await tickets.create(
        {
          userId: me.id,
          nickname: displayName(me),
          type: input.type,
          priority: input.type === 'bug' ? (input.priority ?? 'medium') : null,
          message: input.message,
          client: redact(input.client) as Record<string, unknown>,
          server: manager.snapshotFor(me.id),
          screenshot,
        },
        now(),
      );
      return { id: ticket.id };
    },
  );

  // ---- the admin side -----------------------------------------------------------------------

  /** Staff (moderators and admins) through the panel, or Claude Code with the ticket token. */
  async function ticketStaff(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ id: string; name: string } | null> {
    const header = req.headers.authorization;
    if (deps.apiToken && header?.startsWith('Bearer ') && same(header.slice(7), deps.apiToken))
      return { id: 'claude', name: 'Claude' };
    const me = await authenticate(req, tokens, users);
    if (!me) {
      void reply.code(401).send({ error: 'Not signed in' });
      return null;
    }
    if (!isStaff(me)) {
      void reply.code(403).send({ error: 'No access' });
      return null;
    }
    return { id: me.id, name: displayName(me) };
  }
  const idParam = (req: FastifyRequest) => String((req.params as { id?: string }).id ?? '');
  const audit = (actor: { id: string; name: string }, id: string, action: string, detail = '') =>
    moderation.addAudit(
      {
        actorId: actor.id,
        actorName: actor.name,
        action,
        targetId: null,
        targetName: `ticket ${id.slice(0, 8)}`,
        detail,
      },
      now(),
    );

  app.get('/api/admin/tickets', adminLimits, async (req, reply) => {
    if (!(await ticketStaff(req, reply))) return;
    const q = req.query as Record<string, string | undefined>;
    const pick = <T extends string>(v: string | undefined, all: readonly T[]) =>
      all.includes(v as T) ? (v as T) : undefined;
    return {
      tickets: await tickets.list(
        {
          status: pick<TicketStatus>(q.status, TICKET_STATUSES),
          type: pick<TicketType>(q.type, TICKET_TYPES),
          priority: pick<TicketPriority>(q.priority, TICKET_PRIORITIES),
          open: q.open === '1',
          q: q.q?.slice(0, 80),
        },
        200,
      ),
    };
  });

  app.get('/api/admin/tickets/:id', adminLimits, async (req, reply) => {
    if (!(await ticketStaff(req, reply))) return;
    const ticket = await tickets.get(idParam(req));
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    return { ticket };
  });

  app.get('/api/admin/tickets/:id/screenshot', adminLimits, async (req, reply) => {
    if (!(await ticketStaff(req, reply))) return;
    const shot = await tickets.screenshot(idParam(req));
    if (!shot) return reply.code(404).send({ error: 'Ticket not found' });
    return reply
      .header('content-type', shot.mime)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .send(shot.data);
  });

  app.patch('/api/admin/tickets/:id', adminLimits, async (req, reply) => {
    const actor = await ticketStaff(req, reply);
    if (!actor) return;
    const parsed = ticketPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const ticket = await tickets.patch(idParam(req), parsed.data, now());
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    await audit(actor, ticket.id, 'ticket', JSON.stringify(parsed.data).slice(0, 200));
    return { ticket };
  });

  // "Fix with Claude": the ticket waits in the queue for the fix-ticket skill.
  app.post('/api/admin/tickets/:id/claude', adminLimits, async (req, reply) => {
    const actor = await ticketStaff(req, reply);
    if (!actor) return;
    const ticket = await tickets.patch(idParam(req), { status: 'queued' }, now());
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    await audit(actor, ticket.id, 'ticket', 'queued for Claude');
    return { ticket };
  });

  // Finished tickets are removed after 90 days (a few times a day is plenty).
  const timer = setInterval(
    () => void tickets.purgeDone(now() - KEEP_DONE_MS).catch(() => undefined),
    6 * 60 * 60 * 1000,
  );
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
