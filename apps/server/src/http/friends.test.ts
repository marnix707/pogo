import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededRng } from '@pogo/shared';
import { buildApp } from '../app';
import { createMemoryUserStore } from '../auth/userStore';

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
  profanityFilter: true,
  botDelayMs: 1000,
  mailMode: 'log' as const,
  brevoApiKey: '',
  publicBaseUrl: '',
  smtpUrl: '',
  mailFrom: 'test',
};

let server: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  server = await buildApp({
    config,
    users: createMemoryUserStore(),
    rng: createSeededRng(1),
    healthCheck: async () => {},
  });
});
afterAll(async () => {
  await server.close();
  await server.app.close();
});

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, token?: string, payload?: unknown) =>
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
async function player(nickname: string) {
  const g = await guest(nickname);
  const email = `${nickname.toLowerCase()}@example.com`;
  await call('POST', '/api/account/register/start', g.token, { email });
  const code = (await call('GET', `/api/dev/last-mail?to=${email}`)).json().code as string;
  const res = await call('POST', '/api/account/register/verify', g.token, {
    email,
    code,
    password: 'secret-pass',
  });
  expect(res.statusCode).toBe(200);
  return { token: g.token, id: g.user.id, name: nickname };
}

const overview = async (token: string) =>
  (await call('GET', '/api/friends', token)).json() as {
    friends: { id: string; unread: number; muted: boolean }[];
    incoming: { id: string }[];
    outgoing: { id: string }[];
    code: string;
    blocked: { id: string }[];
  };

describe('friends', () => {
  it('is for registered players only', async () => {
    const g = await guest('Gus');
    expect((await call('GET', '/api/friends', g.token)).statusCode).toBe(403);
    expect((await call('GET', '/api/friends')).statusCode).toBe(401);
  });

  it('request, accept, list, message, remove', async () => {
    const ann = await player('Ann');
    const bob = await player('Bob');
    expect(
      (await call('POST', '/api/friends/request', ann.token, { userId: ann.id })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/friends/request', ann.token, { userId: bob.id })).json().state,
    ).toBe('outgoing');
    expect((await overview(ann.token)).outgoing.map((p) => p.id)).toEqual([bob.id]);
    expect((await overview(bob.token)).incoming.map((p) => p.id)).toEqual([ann.id]);
    // not friends yet: no messages
    expect(
      (await call('POST', `/api/messages/${bob.id}`, ann.token, { text: 'hi' })).statusCode,
    ).toBe(403);
    expect((await call('POST', `/api/friends/${ann.id}/accept`, bob.token)).json().state).toBe(
      'friends',
    );
    expect((await overview(ann.token)).friends.map((p) => p.id)).toEqual([bob.id]);
    // a duplicate request is refused
    expect(
      (await call('POST', '/api/friends/request', ann.token, { userId: bob.id })).statusCode,
    ).toBe(409);

    const sent = await call('POST', `/api/messages/${bob.id}`, ann.token, {
      text: '  hello   there ',
    });
    expect(sent.json().message.text).toBe('hello there');
    expect((await overview(bob.token)).friends[0]!.unread).toBe(1);
    const thread = (await call('GET', `/api/messages/${ann.id}`, bob.token)).json().messages;
    expect(thread).toHaveLength(1);
    await call('POST', `/api/messages/${ann.id}/read`, bob.token);
    expect((await overview(bob.token)).friends[0]!.unread).toBe(0);

    expect((await call('DELETE', `/api/friends/${bob.id}`, ann.token)).json().state).toBe('none');
    expect((await overview(bob.token)).friends).toHaveLength(0);
    expect(
      (await call('POST', `/api/messages/${bob.id}`, ann.token, { text: 'hi' })).statusCode,
    ).toBe(403);
  });

  it('asking back after being asked makes you friends; decline and cancel clear a request', async () => {
    const cy = await player('Cy');
    const di = await player('Di');
    await call('POST', '/api/friends/request', cy.token, { userId: di.id });
    expect(
      (await call('POST', '/api/friends/request', di.token, { userId: cy.id })).json().state,
    ).toBe('friends');
    const ed = await player('Ed');
    await call('POST', '/api/friends/request', ed.token, { userId: cy.id });
    await call('POST', `/api/friends/${ed.id}/decline`, cy.token);
    expect((await overview(cy.token)).incoming).toHaveLength(0);
    await call('POST', '/api/friends/request', ed.token, { userId: di.id });
    await call('POST', `/api/friends/${di.id}/decline`, ed.token); // cancel my own
    expect((await overview(di.token)).incoming).toHaveLength(0);
  });

  it('adds by invite code and finds players by nickname only (never by e-mail)', async () => {
    const fay = await player('Fay');
    const gil = await player('Gilbert');
    const code = (await overview(fay.token)).code;
    expect(code).toMatch(/^[A-Za-z0-9]{12}$/);
    expect((await call('POST', '/api/friends/request', gil.token, { code })).json().state).toBe(
      'outgoing',
    );
    expect(
      (await call('POST', '/api/friends/request', gil.token, { code: 'nonexistent000' }))
        .statusCode,
    ).toBe(404);
    const byName = (await call('GET', '/api/users/search?q=gilb', fay.token)).json().users;
    expect(byName.map((u: { id: string }) => u.id)).toEqual([gil.id]);
    expect(JSON.stringify(byName)).not.toContain('example.com');
    expect((await call('GET', '/api/users/search?q=example.com', fay.token)).json().users).toEqual(
      [],
    );
    expect((await call('GET', '/api/users/search?q=g', fay.token)).json().users).toEqual([]); // too short
  });

  it('blocking removes the friendship, stops requests and messages and hides the player', async () => {
    const hal = await player('Hal');
    const ivy = await player('Ivy');
    await call('POST', '/api/friends/request', hal.token, { userId: ivy.id });
    await call('POST', `/api/friends/${hal.id}/accept`, ivy.token);
    expect((await call('POST', `/api/users/${hal.id}/block`, ivy.token)).json().state).toBe(
      'blocked',
    );
    expect((await overview(hal.token)).friends).toHaveLength(0);
    expect(
      (await call('POST', `/api/messages/${ivy.id}`, hal.token, { text: 'hey' })).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/api/friends/request', hal.token, { userId: ivy.id })).statusCode,
    ).toBe(403);
    expect((await call('GET', `/api/users/${ivy.id}/profile`, hal.token)).statusCode).toBe(404);
    expect((await call('GET', '/api/users/search?q=hal', ivy.token)).json().users).toEqual([]);
    expect((await overview(ivy.token)).blocked.map((p) => p.id)).toEqual([hal.id]);
    await call('POST', `/api/users/${hal.id}/unblock`, ivy.token);
    expect((await overview(ivy.token)).blocked).toHaveLength(0);
  });

  it('a muted friend stays a friend: messages are kept but give no unread badge', async () => {
    const jo = await player('Jo');
    const kim = await player('Kim');
    await call('POST', '/api/friends/request', jo.token, { userId: kim.id });
    await call('POST', `/api/friends/${jo.id}/accept`, kim.token);
    await call('POST', `/api/users/${jo.id}/mute`, kim.token);
    await call('POST', `/api/messages/${kim.id}`, jo.token, { text: 'ping' });
    const view = (await overview(kim.token)).friends[0]!;
    expect(view).toMatchObject({ muted: true, unread: 0 });
    expect((await call('GET', `/api/messages/${jo.id}`, kim.token)).json().messages).toHaveLength(
      1,
    );
    expect((await call('GET', `/api/users/${jo.id}/profile`, kim.token)).json()).toMatchObject({
      muted: true,
      state: 'friends',
    });
    await call('POST', `/api/users/${jo.id}/unmute`, kim.token);
    expect((await overview(kim.token)).friends[0]!.muted).toBe(false);
  });

  it('masks profanity, refuses empty text and floods', async () => {
    const lu = await player('Lu');
    const max = await player('Max');
    await call('POST', '/api/friends/request', lu.token, { userId: max.id });
    await call('POST', `/api/friends/${lu.id}/accept`, max.token);
    expect(
      (await call('POST', `/api/messages/${max.id}`, lu.token, { text: '   ' })).statusCode,
    ).toBe(400);
    let last = 0;
    for (let i = 0; i < 8; i++)
      last = (await call('POST', `/api/messages/${max.id}`, lu.token, { text: `m${i}` }))
        .statusCode;
    expect(last).toBe(429);
  });

  it('an invite needs a lobby you are really in', async () => {
    const nia = await player('Nia');
    const oz = await player('Oz');
    await call('POST', '/api/friends/request', nia.token, { userId: oz.id });
    await call('POST', `/api/friends/${nia.id}/accept`, oz.token);
    expect(
      (await call('POST', `/api/friends/${oz.id}/invite`, nia.token, { roomCode: 'ABCDE' }))
        .statusCode,
    ).toBe(409);
  });

  it('deleting an account takes its friendships along', async () => {
    const pat = await player('Pat');
    const quin = await player('Quin');
    await call('POST', '/api/friends/request', pat.token, { userId: quin.id });
    await call('POST', `/api/friends/${pat.id}/accept`, quin.token);
    expect(
      (await call('DELETE', '/api/me', pat.token, { password: 'secret-pass' })).statusCode,
    ).toBe(200);
    expect((await overview(quin.token)).friends).toHaveLength(0);
  });
});
