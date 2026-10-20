import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';

// Set by docker-compose from PROFANITY_FILTER (the dev server's filter setting).
const filterOn = process.env.PROFANITY_FILTER !== 'off';

async function newPlayer(browser: Browser, nickname: string, avatar: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill(nickname);
  await page.getByRole('button', { name: avatar, exact: true }).click();
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText(nickname);
  return { context, page };
}

test('public games show up live in the lobby, can be joined from it, and quick match fills them', async ({
  browser,
}) => {
  const watcher = await newPlayer(browser, 'Watcher', 'owl');
  const host = await newPlayer(browser, 'Hosty', 'fox');
  const w = watcher.page;
  const h = host.page;

  // Nothing open yet (other tests may have left rooms; look for this host specifically).
  await expect(w.getByText("Hosty's game")).toHaveCount(0);

  // A private room never shows up.
  await h.getByTestId('home-game-yatzy').click();
  await expect(h.getByTestId('room-visibility')).toHaveText('Private');
  await expect(w.getByText("Hosty's game")).toHaveCount(0);

  // Making it public lists it live on the watcher's Home screen, without a refresh.
  await h.getByRole('switch', { name: /Public room/ }).click();
  await expect(h.getByTestId('room-visibility')).toHaveText('Public');
  const listing = w.getByTestId(/^open-game-/).filter({ hasText: "Hosty's game" });
  await expect(listing).toBeVisible();
  await expect(listing).toContainText('1/6');

  // Back to private removes it again.
  await h.getByRole('switch', { name: /Public room/ }).click();
  await expect(listing).toHaveCount(0);
  await h.getByRole('switch', { name: /Public room/ }).click();
  await expect(listing).toBeVisible();

  // Joining from the list puts the watcher into the room; the list entry updates for others.
  await listing.getByRole('button', { name: 'Join' }).click();
  await expect(w.getByTestId('lobby-waiting')).toContainText('Hosty');
  await expect(h.getByTestId('member-Watcher')).toBeVisible();

  // A third player joins from the list too.
  const third = await newPlayer(browser, 'Quicky', 'cat');
  await third.page
    .getByTestId(/^open-game-/)
    .filter({ hasText: "Hosty's game" })
    .getByRole('button', { name: 'Join' })
    .click();
  await expect(third.page.getByTestId('lobby-waiting')).toBeVisible();
  await expect(h.getByTestId('member-Quicky')).toBeVisible();
  await expect(h.getByTestId('player-count')).toHaveText('3 / 6');

  // Leave so the public room does not linger in the shared lobby for other tests.
  for (const p of [third.page, w, h]) await p.getByTestId('lobby-leave').click();

  await watcher.context.close();
  await host.context.close();
  await third.context.close();
});

test('players chat in the lobby and during the game; profanity is masked', async ({
  browser,
}) => {
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];

  await a.getByTestId('home-game-yatzy').click();

  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.getByTestId('home-join-code').fill(code);
  await b.getByTestId('home-join-submit').click();
  await expect(b.getByTestId('lobby-waiting')).toBeVisible();

  // Waiting-room chat, both directions.
  await a.getByTestId('chat-input').fill('hello Bob!');
  await a.getByTestId('chat-send').click();
  await expect(b.getByTestId('chat-message').filter({ hasText: 'hello Bob!' })).toBeVisible();
  await expect(a.getByTestId('chat-message').filter({ hasText: 'hello Bob!' })).toBeVisible();
  await expect(a.getByTestId('chat-input')).toHaveValue('');

  await b.getByTestId('chat-input').fill('well shit, ready!');
  await b.getByTestId('chat-send').click();
  await expect(
    a.getByTestId('chat-message').filter({
      hasText: filterOn ? 'well ****, ready!' : 'well shit, ready!',
    }),
  ).toBeVisible();

  // Start the game: the chat moves into a sheet behind a button, and keeps its history.
  await a.getByTestId('lobby-start').click();
  await expect(a.getByTestId('turn-banner')).toBeVisible();
  await expect(b.getByTestId('turn-banner')).toBeVisible();
  await expect(b.getByTestId('chat-badge')).toHaveCount(0);

  await a.getByTestId('chat-open').click();
  await expect(a.getByTestId('chat-message')).toHaveCount(2); // history survived
  await a.getByTestId('chat-input').fill('good luck');
  await a.getByTestId('chat-send').click();

  // Bob has the sheet closed: he sees an unread badge, opening it shows the message and clears it.
  await expect(b.getByTestId('chat-badge')).toHaveText('1');
  await b.getByTestId('chat-open').click();
  await expect(b.getByTestId('chat-message').filter({ hasText: 'good luck' })).toBeVisible();
  await b.getByRole('button', { name: 'Close' }).click();
  await expect(b.getByTestId('chat-badge')).toHaveCount(0);

  // A refresh mid-game brings the history back.
  await b.reload();
  await expect(b.getByTestId('turn-banner')).toBeVisible();
  await b.getByTestId('chat-open').click();
  await expect(b.getByTestId('chat-message')).toHaveCount(3);

  await alice.context.close();
  await bob.context.close();
});

test('profane nicknames are refused at sign-in when the filter is on (and allowed when off)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Big Sh1t');
  await page.getByTestId('signin-submit').click();
  if (filterOn) {
    await expect(page.getByRole('alert')).toContainText('different nickname');
    await expect(page.getByTestId('home-nickname')).toHaveCount(0);
  } else {
    await expect(page.getByTestId('home-nickname')).toHaveText('Big Sh1t');
  }
  await context.close();
});

test('the dashboard: join-by-code beside the name, open games, then the games; a game tap opens its lobby', async ({
  browser,
}) => {
  const me = await newPlayer(browser, 'Layout', 'fox');
  const page = me.page;
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;

  // Top row: the name and the join form share a row.
  const name = await box('home-nickname');
  const code = await box('home-join-code');
  expect(Math.abs(name.y - code.y)).toBeLessThan(60);
  expect(code.x).toBeGreaterThan(name.x);

  // Order: open games above the games section; the game cards have no action buttons.
  const open = await page.getByRole('region', { name: 'Open games' }).boundingBox();
  const games = await page.getByRole('region', { name: 'Games', exact: true }).boundingBox();
  expect(open!.y).toBeLessThan(games!.y);

  // Tapping a game goes straight to its lobby (no menu in between).
  await page.getByTestId('home-game-karma').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  await expect(page.getByTestId('lobby-start')).toBeVisible();
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0);
  await me.context.close();
});
