import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

test('the host switches the game in the lobby and everybody stays', async ({ browser }) => {
  const host = await newPlayer(browser, 'Hosty', 'fox');
  const guest = await newPlayer(browser, 'Guesty', 'cat');
  await host.page.getByTestId('home-play').click();
  await host.page.getByTestId('home-game-karma').click();
  const code = (await host.page.getByTestId('room-code').textContent())!.trim();

  await guest.page.getByTestId('home-play').click();
  await guest.page.getByTestId('home-join-code').fill(code);
  await guest.page.getByTestId('home-join-submit').click();
  await expect(guest.page.getByTestId('member-Hosty')).toBeVisible();
  // Only the host can switch: the guest has Leave lobby instead.
  await expect(guest.page.getByTestId('lobby-change-game')).toHaveCount(0);
  await expect(guest.page.getByTestId('lobby-back')).toBeVisible();

  await host.page.getByTestId('lobby-change-game').click();
  await host.page.getByTestId('pick-game-lastcard').click();

  // Same room, same people, new game.
  await expect(host.page.getByText('Last Card').first()).toBeVisible();
  await expect(guest.page.getByText('Last Card').first()).toBeVisible();
  await expect(host.page.getByTestId('member-Guesty')).toBeVisible();
  await expect(guest.page.getByTestId('member-Hosty')).toBeVisible();
  await expect(host.page.getByTestId('room-code')).toHaveText(code);
  await host.context.close();
  await guest.context.close();
});
