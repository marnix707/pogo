import { expect, test } from '@playwright/test';

// Needs ADMIN_EMAILS=admin-e2e@example.com on the server (docker compose passes it through).
const EMAIL = 'admin-e2e@example.com';
test.skip(!(process.env.ADMIN_EMAILS ?? '').includes(EMAIL), `set ADMIN_EMAILS=${EMAIL} to run`);

const VICTIM = `Vic${Date.now() % 1_000_000}`;

test('an admin finds a player, gives the (dev) tag and bans them', async ({ browser, request }) => {
  // The admin's account (registered through the API: guest, emailed code, password).
  const g = await (
    await request.post('/api/auth/guest', { data: { nickname: 'AdminE2E', avatar: 'owl' } })
  ).json();
  const auth = { authorization: `Bearer ${g.token}` };
  await request.post('/api/account/register/start', { headers: auth, data: { email: EMAIL } });
  const code = (await (await request.get(`/api/dev/last-mail?to=${EMAIL}`)).json()).code;
  await request.post('/api/account/register/verify', {
    headers: auth,
    data: { email: EMAIL, code, password: 'secret-pass' },
  });

  const victim = await (
    await request.post('/api/auth/guest', { data: { nickname: VICTIM, avatar: 'fox' } })
  ).json();

  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/admin');
  await page.getByTestId('admin-email').fill(EMAIL);
  await page.getByTestId('admin-password').fill('secret-pass');
  await page.getByTestId('admin-submit').click();
  await expect(page.getByTestId('admin-panel')).toBeVisible();
  // The player list shows registered players by default; the victim is a guest.
  await page.getByTestId('admin-show-everyone').click();
  await page.getByTestId('admin-search').fill(VICTIM);
  await page.getByTestId(`admin-user-${VICTIM}`).click();
  await page.screenshot({ path: 'test-results/admin-sheet.png' });
  await page.getByTestId('admin-menu-role').click();
  await page.getByTestId('admin-dev').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId(`admin-user-${VICTIM}`)).toContainText(`${VICTIM} (dev)`);

  await page.getByTestId(`admin-user-${VICTIM}`).click();
  await page.getByTestId('admin-menu-ban').click();
  await page.getByTestId('admin-ban-reason').fill('testing');
  await page.getByTestId('admin-ban').click();
  await expect(page.getByTestId(`admin-user-${VICTIM}`)).toContainText('banned');
  const me = await request.get('/api/me', { headers: { authorization: `Bearer ${victim.token}` } });
  expect(me.status()).toBe(403);
  await page.getByTestId('admin-tab-bans').click();
  await page.screenshot({ path: 'test-results/admin-bans.png' });
  await expect(page.getByTestId('admin-bans')).toContainText(VICTIM);
  await ctx.close();
});
