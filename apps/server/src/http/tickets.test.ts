import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import type { Role } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';
import type { UserStore } from '../auth/userStore';
import { hashPassword } from '../auth/passwords';

const TICKET_TOKEN = 'claude-ticket-token-0123456789';
const config = {
  nodeEnv: 'test' as const,
  isProd: false,
  port: 0,
  webPort: 5173,
  databaseUrl: '',
  jwtSecret: 'test-secret-test-secret-test-secret',
  corsOrigins: true as const,
  logLevel: 'error' as const,
  lanIps: [],
  turnTimeSec: 0,
  disconnectGraceMs: 20_000,
  roomTtlMs: 600_000,
  guestSignupLimitPerMin: 1000,
  profanityFilter: false,
  botDelayMs: 1000,
  mailMode: 'log' as const,
  brevoApiKey: '',
  publicBaseUrl: '',
  smtpUrl: '',
  mailFrom: 'test',
  ticketApiToken: TICKET_TOKEN,
};

let users: UserStore;
let server: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  users = createMemoryUserStore();
  server = await buildApp({ config, users, rng: createSeededRng(1), healthCheck: async () => {} });
});
afterAll(async () => {
  await server.close();
  await server.app.close();
});

const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token?: string, payload?: unknown) =>
  server.app.inject({
    method,
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function guest(nickname: string) {
  const res = await call('POST', '/api/auth/guest', undefined, { nickname, avatar: 'fox' });
  return res.json() as { token: string; user: { id: string } };
}
async function staffMember(nickname: string, role: Role) {
  const g = await guest(nickname);
  await users.register(
    g.user.id,
    `${nickname.toLowerCase()}@example.com`,
    await hashPassword('secret-pass'),
  );
  await users.setRole(g.user.id, role);
  return g;
}

// 1x1 PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAQ3a6fQAAAABJRU5ErkJggg==';

describe('tickets', () => {
  it('any signed-in player (a guest too) can send a bug with a screenshot and the captured state', async () => {
    const p = await guest('Reporter');
    const res = await call('POST', '/api/tickets', p.token, {
      type: 'bug',
      priority: 'high',
      message: 'The wheel does not spin',
      screenshot: PNG,
      client: {
        screen: 'game',
        room: { gameId: 'bankrupt' },
        token: 'secret',
        nested: { password: 'x' },
      },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json().id as string;
    const admin = await staffMember('Boss', 'admin');
    const list = (await call('GET', '/api/admin/tickets?open=1', admin.token)).json().tickets;
    expect(list[0]).toMatchObject({
      id,
      type: 'bug',
      priority: 'high',
      status: 'new',
      screen: 'game',
      gameId: 'bankrupt',
      hasScreenshot: true,
      nickname: 'Reporter',
    });
    const detail = (await call('GET', `/api/admin/tickets/${id}`, admin.token)).json().ticket;
    // secrets never get stored
    expect(JSON.stringify(detail.client)).not.toContain('secret');
    expect(detail.client.token).toBe('[removed]');
    const shot = await call('GET', `/api/admin/tickets/${id}/screenshot`, admin.token);
    expect(shot.statusCode).toBe(200);
    expect(shot.headers['content-type']).toBe('image/png');
    expect(shot.headers['x-content-type-options']).toBe('nosniff');
  });

  it('feedback has no priority; a bug defaults to medium', async () => {
    const p = await guest('Chatty');
    const admin = await staffMember('Mod2', 'moderator');
    const f = await call('POST', '/api/tickets', p.token, {
      type: 'feedback',
      priority: 'critical',
      message: 'I love the frogs',
    });
    const b = await call('POST', '/api/tickets', p.token, {
      type: 'bug',
      message: 'something odd',
    });
    const get = async (id: string) =>
      (await call('GET', `/api/admin/tickets/${id}`, admin.token)).json().ticket;
    expect((await get(f.json().id)).priority).toBeNull();
    expect((await get(b.json().id)).priority).toBe('medium');
  });

  it('rejects empty reports, non-images, oversized screenshots and anonymous senders', async () => {
    const p = await guest('Sloppy');
    expect(
      (await call('POST', '/api/tickets', undefined, { type: 'bug', message: 'hello there' }))
        .statusCode,
    ).toBe(401);
    const short = await call('POST', '/api/tickets', p.token, { type: 'bug', message: 'x' });
    expect(short.statusCode).toBe(400);
    expect(short.json().code).toBe('TIC-101');
    const fake = await call('POST', '/api/tickets', p.token, {
      type: 'bug',
      message: 'with a fake picture',
      screenshot: `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`,
    });
    expect(fake.statusCode).toBe(400);
    expect(fake.json().code).toBe('TIC-103');
  });

  it('caps the reports of one player per day', async () => {
    const p = await guest('Spammer');
    let last = 200;
    for (let i = 0; i < 21; i++)
      last = (
        await call('POST', '/api/tickets', p.token, { type: 'bug', message: `report ${i} here` })
      ).statusCode;
    expect(last).toBe(429);
  });

  it('staff can add a ticket by hand in the admin panel', async () => {
    const mod = await staffMember('Mod4', 'moderator');
    const p = await guest('Plain2');
    expect(
      (
        await call('POST', '/api/admin/tickets', p.token, {
          type: 'feedback',
          message: 'an idea here',
        })
      ).statusCode,
    ).toBe(403);
    const res = await call('POST', '/api/admin/tickets', mod.token, {
      type: 'feedback',
      message: 'Add a spectator mode for Bankrupt',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket).toMatchObject({ status: 'new', type: 'feedback', screen: 'admin' });
    expect(
      (await call('POST', '/api/admin/tickets', mod.token, { type: 'bug', message: 'x' })).json()
        .code,
    ).toBe('TIC-101');
  });

  it('players cannot read tickets; staff can move them along; the Claude token only reaches tickets', async () => {
    const p = await guest('Nosy');
    expect((await call('GET', '/api/admin/tickets', p.token)).statusCode).toBe(403);
    const sent = await call('POST', '/api/tickets', p.token, {
      type: 'bug',
      message: 'please fix this',
    });
    const id = sent.json().id as string;
    const mod = await staffMember('Mod3', 'moderator');
    const queued = await call('POST', `/api/admin/tickets/${id}/claude`, mod.token);
    expect(queued.json().ticket.status).toBe('queued');
    // Claude Code: reads, starts, finishes with a note
    expect((await call('GET', `/api/admin/tickets/${id}`, TICKET_TOKEN)).statusCode).toBe(200);
    const done = await call('PATCH', `/api/admin/tickets/${id}`, TICKET_TOKEN, {
      status: 'fixed',
      claudeNote: 'fixed in abc1234',
    });
    expect(done.json().ticket).toMatchObject({ status: 'fixed', claudeNote: 'fixed in abc1234' });
    expect((await call('GET', '/api/admin/users', TICKET_TOKEN)).statusCode).toBe(401);
    expect((await call('GET', '/api/admin/tickets', 'wrong-token')).statusCode).toBe(401);
    const bad = await call('PATCH', `/api/admin/tickets/${id}`, mod.token, { status: 'sideways' });
    expect(bad.statusCode).toBe(400);
    expect((await call('GET', '/api/admin/tickets/nope', mod.token)).json().code).toBe('TIC-104');
  });
});

describe('turning a ticket into another type, and "My reports"', () => {
  it('an admin turns a bug into feedback (no priority) and back (priority medium)', async () => {
    const p = await guest('Switcher');
    const id = (
      await call('POST', '/api/tickets', p.token, {
        type: 'bug',
        priority: 'critical',
        message: 'This is really an idea',
      })
    ).json().id as string;
    const admin = await staffMember('Switch Boss', 'admin');
    const toFeedback = await call('PATCH', `/api/admin/tickets/${id}`, admin.token, {
      type: 'feedback',
    });
    expect(toFeedback.json().ticket).toMatchObject({ type: 'feedback', priority: null });
    // a priority cannot be set on feedback
    const stay = await call('PATCH', `/api/admin/tickets/${id}`, admin.token, { priority: 'high' });
    expect(stay.json().ticket.priority).toBeNull();
    const back = await call('PATCH', `/api/admin/tickets/${id}`, admin.token, { type: 'bug' });
    expect(back.json().ticket).toMatchObject({ type: 'bug', priority: 'medium' });
    const again = await call('PATCH', `/api/admin/tickets/${id}`, admin.token, {
      type: 'bug',
      priority: 'high',
    });
    expect(again.json().ticket.priority).toBe('high');
  });

  it('a player sees only their own tickets, with an unread flag for changes until they look', async () => {
    const a = await guest('Mine A');
    const b = await guest('Mine B');
    const idA = (
      await call('POST', '/api/tickets', a.token, { type: 'bug', message: 'A found something' })
    ).json().id as string;
    await call('POST', '/api/tickets', b.token, { type: 'feedback', message: 'B has an idea' });
    const first = (await call('GET', '/api/tickets/mine', a.token)).json();
    expect(first.tickets).toHaveLength(1);
    expect(first.tickets[0]).toMatchObject({ id: idA, status: 'new', unread: false });
    expect(first.unread).toBe(0);
    // nothing of the admin side leaks into the player's list
    expect(Object.keys(first.tickets[0]).sort()).toEqual(
      ['createdAt', 'id', 'message', 'status', 'type', 'unread', 'updatedAt'].sort(),
    );

    const admin = await staffMember('Mine Boss', 'admin');
    await call('PATCH', `/api/admin/tickets/${idA}`, admin.token, { status: 'triaged' });
    // (an internal note is not a change the player sees)
    await call('PATCH', `/api/admin/tickets/${idA}`, admin.token, { adminNote: 'later' });
    const changed = (await call('GET', '/api/tickets/mine', a.token)).json();
    expect(changed.unread).toBe(1);
    expect(changed.tickets[0]).toMatchObject({ status: 'triaged', unread: true });
    // looking clears it; another change (the type) makes it unread again
    await call('POST', '/api/tickets/mine/seen', a.token);
    expect((await call('GET', '/api/tickets/mine', a.token)).json().unread).toBe(0);
    await call('PATCH', `/api/admin/tickets/${idA}`, admin.token, { type: 'feedback' });
    const retyped = (await call('GET', '/api/tickets/mine', a.token)).json();
    expect(retyped.tickets[0]).toMatchObject({ type: 'feedback', unread: true });
    // B's own list is untouched
    expect((await call('GET', '/api/tickets/mine', b.token)).json().unread).toBe(0);
    expect((await call('GET', '/api/tickets/mine')).statusCode).toBe(401);
  });
});
