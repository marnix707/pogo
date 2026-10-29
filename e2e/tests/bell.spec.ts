import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

test('ring the bell: after Ready the button nudges everybody else in the lobby', async ({
  browser,
}) => {
  const host = await newPlayer(browser, 'Ringer', 'fox');
  const guest = await newPlayer(browser, 'Sleeper', 'cat');
  await host.page.getByTestId('home-play').click();
  await host.page.getByTestId('home-game-karma').click();
  // The lobby is public: the guest joins it from the open games list.
  await expect(host.page.getByTestId('lobby-ready')).toBeVisible();
  await guest.page.getByTestId('home-play').click();
  await guest.page.locator('[data-testid^=lobby-join-]').first().click();
  await expect(guest.page.getByTestId('member-Ringer')).toBeVisible();

  // No bell before Ready; after Ready it sits above the Ready button.
  await expect(host.page.getByTestId('lobby-bell')).toHaveCount(0);
  await host.page.getByTestId('lobby-ready').click();
  const bell = host.page.getByTestId('lobby-bell');
  await expect(bell).toBeVisible();
  await expect(bell).toHaveText('Ring the bell!');
  await bell.click();

  // The guest gets the banner (the shake and the sound are on top of that); the ringer does not.
  await expect(guest.page.getByTestId('bell-banner')).toContainText('Ringer');
  await expect(host.page.getByTestId('bell-banner')).toHaveCount(0);
  // A short cooldown on the button.
  await expect(bell).toBeDisabled();
  await expect(bell).toContainText('Ring the bell (');
  await host.context.close();
  await guest.context.close();
});
