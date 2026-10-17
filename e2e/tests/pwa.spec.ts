import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// iPhone look-alike (user agent, screen, touch) but still Chromium: the preset's browser type can't be
// switched inside a describe block, and we only need the iOS user agent for the install help.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iphone } = devices['iPhone 13'];

async function signIn(page: Page, nickname: string) {
  await page.goto('/');
  await page.getByTestId('signin-nickname').fill(nickname);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('home-nickname')).toHaveText(nickname);
}

test('the page advertises a fullscreen home-screen app with working icons', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );

  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Pogo', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain(icon.type);
  }
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
});

test.describe('iPhone (no install prompt exists there, so we explain the Share menu)', () => {
  test.use(iphone);

  test('shows how to add Pogo to the home screen, and remembers when dismissed', async ({
    page,
  }) => {
    await signIn(page, 'Iris');
    const banner = page.getByTestId('install-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('install-prompt')).toHaveCount(0);

    await page.getByTestId('install-how').click();
    const steps = page.getByTestId('install-steps');
    await expect(steps).toContainText('Share');
    await expect(steps).toContainText('Add to Home Screen');
    await expect(steps).toContainText('Still opens with browser bars');
    await page.getByRole('button', { name: 'Close' }).click();

    // The same help is always available in Settings.
    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('install-settings')).toBeVisible();
    await expect(page.getByTestId('display-mode')).toHaveAttribute('data-standalone', 'false');
    await expect(page.getByTestId('display-mode')).toContainText('browser tab');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByTestId('install-dismiss').click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('home-nickname')).toBeVisible();
    await expect(page.getByTestId('install-banner')).toHaveCount(0);
  });

  test('is hidden when Pogo already runs from the home screen', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
    });
    await signIn(page, 'Standalone');
    await expect(page.getByTestId('install-banner')).toHaveCount(0);
    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('install-settings')).toHaveCount(0);
    await expect(page.getByTestId('display-mode')).toHaveAttribute('data-standalone', 'true');
    await expect(page.getByTestId('display-mode')).toContainText('Running as an app');
  });
});

test('Android/Chrome: the browser install prompt is wired to our Install button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Chrome fires this event when the app is installable; fake one we can observe.
    window.addEventListener('load', () => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          (window as unknown as { __prompted: boolean }).__prompted = true;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
  });
  await signIn(page, 'Andy');
  await expect(page.getByTestId('install-banner')).toBeVisible();
  await page.getByTestId('install-prompt').click();
  expect(
    await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted),
  ).toBe(true);
  // The prompt can only be used once, so the button goes away afterwards.
  await expect(page.getByTestId('install-banner')).toHaveCount(0);
});

test('a normal desktop browser without an install option sees no banner', async ({ page }) => {
  await signIn(page, 'Desk');
  await expect(page.getByTestId('install-banner')).toHaveCount(0);
});
