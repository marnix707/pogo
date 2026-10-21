import { expect, test } from '@playwright/test';

// The other specs run with reduced motion (no intro); this one plays the real opening animation.
test('opening: the stick waits alone, the toad lands, then the wordmark and menu slide in; tapping makes him jump', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Intro');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('pogo-stage')).toBeVisible();
  await page.screenshot({ path: 'test-results/intro-0-start.png' });
  await expect(page.getByTestId('home-wordmark')).toHaveClass(/wordmark-in/, { timeout: 15_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/intro-2-landed.png' });
  // After three bounces he rests; a tap makes him jump once.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'test-results/intro-3-resting.png' });
  await page.getByTestId('pogo-jump').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/intro-4-tap.png' });
  await page.getByTestId('home-play').click();
  await expect(page.getByTestId('home-back')).toBeVisible();

  // Into a game lobby and back: the intro never plays again (the menu is simply there at once).
  await page.getByTestId('home-game-yatzy').click();
  await expect(page.getByTestId('lobby-back')).toBeVisible();
  await page.getByTestId('lobby-back').click();
  await expect(page.getByTestId('home-wordmark')).toHaveClass(/wordmark-in/, { timeout: 1500 });
  await expect(page.getByTestId('home-play')).toBeVisible({ timeout: 1500 });
  await context.close();
});
