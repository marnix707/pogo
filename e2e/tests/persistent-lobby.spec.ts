import { expect, test } from '@playwright/test';
import { newPlayer, leaveLobby, openLobbySettings } from './karma-helpers';

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
  // Only the host can switch: the guest's top card is not a button.
  await expect(guest.page.getByTestId('lobby-game-card')).toBeVisible();
  await expect(guest.page.getByTestId('game-card-chevron')).toHaveCount(0);

  // The host taps the game card at the top: the other games drop in; picking one switches the lobby.
  await host.page.getByTestId('lobby-game-card').click();
  await expect(host.page.getByTestId('game-list')).toBeVisible();
  // It is the same screen as after Play: the code form, all games, and the open games underneath.
  await expect(host.page.getByTestId('home-join-code')).toBeVisible();
  await expect(host.page.getByRole('region', { name: 'Open games' })).toBeVisible();
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

test('a locked Ready survives a setting change; cancelling unlocks it', async ({ browser }) => {
  const host = await newPlayer(browser, 'Locker', 'fox');
  const guest = await newPlayer(browser, 'Waiter', 'cat');
  await host.page.getByTestId('home-play').click();
  await host.page.getByTestId('home-game-karma').click();
  const code = (await host.page.getByTestId('room-code').textContent())!.trim();
  await guest.page.getByTestId('home-play').click();
  await guest.page.getByTestId('home-join-code').fill(code);
  await guest.page.getByTestId('home-join-submit').click();
  await expect(guest.page.getByTestId('member-Locker')).toBeVisible();

  // The open padlock only shows once you are ready; tapping it locks.
  await expect(host.page.getByTestId('lobby-ready-lock')).toHaveCount(0);
  await host.page.getByTestId('lobby-ready').click();
  await expect(host.page.getByTestId('lobby-ready-lock')).toHaveAttribute('aria-pressed', 'false');
  await host.page.getByTestId('lobby-ready-lock').click();
  await expect(host.page.getByTestId('lobby-ready-lock')).toHaveAttribute('aria-pressed', 'true');
  await expect(guest.page.getByTestId('member-Locker')).toContainText('Ready');

  // The guest readies up too, then the host changes a setting: the lock keeps the host ready, the guest is reset.
  await guest.page.getByTestId('lobby-ready').click();
  await openLobbySettings(host.page);
  await host.page.getByTestId('turn-timer').getByRole('button', { name: '60s' }).click();
  await expect(guest.page.getByTestId('member-Waiter')).toContainText('Not ready');
  await expect(guest.page.getByTestId('member-Locker')).toContainText('Ready');

  // Cancelling Ready unlocks it.
  await host.page.getByTestId('lobby-ready').click();
  await expect(host.page.getByTestId('lobby-ready-lock')).toHaveCount(0);
  await expect(guest.page.getByTestId('member-Locker')).toContainText('Not ready');
  await host.context.close();
  await guest.context.close();
});
