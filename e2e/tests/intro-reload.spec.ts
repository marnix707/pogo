import { expect, test } from '@playwright/test';
test('intro plays again after a reload with a saved session', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill('Reloader');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-wordmark')).toHaveClass(/wordmark-in/, { timeout: 20_000 });
  await page.reload();
  await page.mouse.click(100, 300);
  await expect(page.getByTestId('pogo-stage')).toBeVisible();
  // Not landed yet shortly after the reload: the menu buttons are still waiting offscreen.
  await expect(page.locator('.slide-bottom[data-in="false"]').first()).toBeAttached({
    timeout: 3000,
  });
  await page.screenshot({ path: 'test-results/intro-reload.png' });
  await expect(page.locator('.slide-bottom[data-in="true"]').first()).toBeAttached({
    timeout: 20_000,
  });
  await context.close();
});
