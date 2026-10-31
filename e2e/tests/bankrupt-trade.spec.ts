import { expect, test } from '@playwright/test';
import { newPlayer, readyAll } from './karma-helpers';

test('Bankrupt!: a trade between two players gives both a $100 bonus', async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await newPlayer(browser, 'Alice', 'fox');
  const bob = await newPlayer(browser, 'Bob', 'cat');
  const [a, b] = [alice.page, bob.page];
  await a.getByTestId('home-play').click();
  await a.getByTestId('home-game-bankrupt').click();
  await b.getByTestId('home-play').click();
  // (The open-games list may be full of rooms other tests left behind: find Alice's.)
  const listing = b.getByTestId(/^open-game-/).filter({ hasText: "Alice's game" });
  await listing.locator('[data-testid^=lobby-join-]').click({ timeout: 20_000 });
  await expect(b.getByTestId('lobby-ready')).toBeVisible();
  await readyAll(a, b);
  await expect(a.getByTestId('bankrupt-game')).toBeVisible();

  // Whoever plays first can trade before rolling.
  const first = (await a.getByTestId('bk-trade').count()) ? [a, b] : [b, a];
  const [mover, other] = first as [typeof a, typeof a];
  await mover.getByTestId('bk-trade').click();
  await mover.getByTestId('bk-trade-more').click(); // +$50 from the mover
  await mover.getByTestId('bk-trade-send').click();
  await expect(other.getByTestId('bk-trade-offer')).toBeVisible();
  await other.getByTestId('bk-trade-accept').click();
  await expect(mover.getByTestId('bk-trade-offer')).toHaveCount(0);
  // Start cash is 1000 / 1050; the mover paid 50 and both got 100 -> the mover has +50, the other +150.
  const cashes = await mover.locator('[data-testid^=bk-cash-]').allInnerTexts();
  expect(cashes.join(' ')).toMatch(/\$1,1[05]0|\$1,2[05]0/);
  await mover.screenshot({ path: 'test-results/bankrupt-trade.png' });
});
