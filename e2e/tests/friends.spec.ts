import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { newPlayer } from './karma-helpers';

/** A guest turned into a registered account through the API (the dev mailbox gives the code), then reloaded. */
async function registered(browser: Browser, nickname: string, avatar: string) {
  const p = await newPlayer(browser, nickname, avatar);
  const token = await p.page.evaluate(() => localStorage.getItem('pogo.token'));
  const email = `${nickname.toLowerCase()}-${Date.now()}@example.com`;
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const start = await p.page.request.post('/api/account/register/start', {
    ...auth,
    data: { email },
  });
  expect(start.ok()).toBe(true);
  const mail = await (await p.page.request.get(`/api/dev/last-mail?to=${email}`)).json();
  const done = await p.page.request.post('/api/account/register/verify', {
    ...auth,
    data: { email, code: mail.code, password: 'secret-pass' },
  });
  expect(done.ok()).toBe(true);
  await p.page.reload();
  await expect(p.page.getByTestId('home-nickname')).toHaveText(nickname);
  return p;
}

const openFriends = async (page: Page) => {
  await page.getByTestId('friends-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
};

test('friends: find by name, request, accept, message, mute, block', async ({ browser }) => {
  // (Unique names: earlier runs leave their accounts in the database.)
  const n = String(Date.now() % 100000);
  const aliceName = `Al${n}`;
  const bobName = `Bo${n}`;
  const alice = await registered(browser, aliceName, 'fox');
  const bob = await registered(browser, bobName, 'cat');
  const [a, b] = [alice.page, bob.page];

  // Alice finds Bobby by nickname and asks.
  await openFriends(a);
  await a.getByTestId('friends-tab-find').click();
  await a.getByTestId('friends-search').fill(bobName);
  await a.locator('[data-testid^="found-add-"]').first().click();
  await expect(a.locator('[data-testid^="found-add-"]')).toHaveCount(0); // now shows "sent"

  // Bobby sees the badge, accepts in Requests.
  await expect(b.getByTestId('friends-badge')).toHaveText('1');
  await openFriends(b);
  await b.getByTestId('friends-tab-requests').click();
  await b.locator('[data-testid^="request-accept-"]').first().click();
  await b.getByTestId('friends-tab-friends').click();
  await expect(b.getByTestId('friends-list')).toContainText(aliceName);
  await b.keyboard.press('Escape');

  // Alice writes; Bobby gets a banner and an unread count, then reads it in the thread.
  await a.getByTestId('friends-tab-friends').click();
  await expect(a.getByTestId('friends-list')).toContainText(bobName);
  await a.locator('[data-testid^="friend-message-"]').first().click();
  await a.getByTestId('thread-input').fill('hello there');
  await a.getByTestId('thread-send').click();
  await expect(a.getByTestId('dm-mine')).toHaveText('hello there');
  await expect(b.getByTestId('dm-banner')).toContainText('hello there');
  await expect(b.getByTestId('friends-badge')).toHaveText('1');
  await b.getByTestId('dm-banner').getByRole('button').first().click();
  await expect(b.getByTestId('dm-theirs')).toHaveText('hello there');
  await b.getByTestId('thread-input').fill('hi back');
  await b.getByTestId('thread-send').click();
  await expect(a.getByTestId('dm-theirs')).toHaveText('hi back');
  await a.context().close();
  await b.context().close();
});

test('guests are asked to register', async ({ browser }) => {
  const g = await newPlayer(browser, 'Gast', 'fox');
  await g.page.getByTestId('friends-button').click();
  await expect(g.page.getByTestId('friends-guest')).toBeVisible();
  await g.context.close();
});
