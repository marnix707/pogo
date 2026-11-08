import { expect, test } from '@playwright/test';
import { newPlayer } from './karma-helpers';

// Needs ADMIN_EMAILS=admin-e2e@example.com on the server (docker compose passes it through).
const EMAIL = 'tickets-e2e@example.com';
test.skip(
  !(process.env.ADMIN_EMAILS ?? '').includes(EMAIL),
  `set ADMIN_EMAILS=${EMAIL} to run`,
);

const TEXT = `The frog is stuck ${Date.now() % 1_000_000}`;

test('a player sends a bug with a screenshot and an admin queues it for Claude', async ({
  browser,
  request,
}) => {
  // the admin's account is made through the dev mailbox: it needs MAIL_MODE=log (see CLAUDE.md)
  const mailbox = await request.get('/api/dev/last-mail?to=nobody@example.com');
  test.skip(mailbox.status() === 404, 'needs the server on MAIL_MODE=log');
  const { page } = await newPlayer(browser, 'Reporter', 'fox');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('bug-button').click();
  await expect(page.getByTestId('bug-form')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('bug-priority-high').click();
  await page.getByTestId('bug-message').fill(TEXT);
  await page.screenshot({ path: 'test-results/bug-form.png' });
  await page.getByTestId('bug-send').click();
  await expect(page.getByTestId('toast')).toContainText('Bug report sent');

  // the admin's account (guest, emailed code, password)
  const g = await (
    await request.post('/api/auth/guest', { data: { nickname: 'TicketAdmin', avatar: 'owl' } })
  ).json();
  const auth = { authorization: `Bearer ${g.token}` };
  await request.post('/api/account/register/start', { headers: auth, data: { email: EMAIL } });
  const code = (await (await request.get(`/api/dev/last-mail?to=${EMAIL}`)).json()).code;
  await request.post('/api/account/register/verify', {
    headers: auth,
    data: { email: EMAIL, code, password: 'secret-pass' },
  });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const admin = await ctx.newPage();
  await admin.goto('/admin');
  await admin.getByTestId('admin-email').fill(EMAIL);
  await admin.getByTestId('admin-password').fill('secret-pass');
  await admin.getByTestId('admin-submit').click();
  await expect(admin.getByTestId('admin-panel')).toBeVisible();
  await admin.getByTestId('admin-tab-tickets').click();
  await expect(admin.getByTestId('admin-tickets')).toContainText(TEXT);
  await admin.getByTestId('admin-tickets').getByText(TEXT).first().click();
  await expect(admin.getByTestId('ticket-detail')).toContainText('high');
  await expect(admin.getByTestId('ticket-json-client')).toBeVisible();
  await admin.screenshot({ path: 'test-results/ticket-detail.png' });
  await admin.getByTestId('ticket-fix').click();
  await expect(admin.getByTestId('ticket-detail')).toContainText('Queued for Claude');
  await ctx.close();
});
