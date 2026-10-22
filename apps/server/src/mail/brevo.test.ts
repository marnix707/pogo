import { describe, expect, it, vi } from 'vitest';
import { createBrevoMailer, parseFrom } from './mailer';
import { codeMail } from './template';

describe('parseFrom', () => {
  it('splits a display name and an address', () => {
    expect(parseFrom('POGO <hi@maruha.nl>')).toEqual({ name: 'POGO', email: 'hi@maruha.nl' });
    expect(parseFrom('hi@maruha.nl')).toEqual({ email: 'hi@maruha.nl' });
  });
});

describe('createBrevoMailer', () => {
  const ok = () => vi.fn(async () => new Response('{}', { status: 201 }));

  it('posts the mail to the Brevo API with the key and the artwork url', async () => {
    const fetchMock = ok();
    await createBrevoMailer(
      'k',
      'POGO <hi@maruha.nl>',
      'https://x.nl/mail-hero.png',
      fetchMock,
    ).send(codeMail('a@b.nl', 'register', '064242'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');
    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ name: 'POGO', email: 'hi@maruha.nl' });
    expect(body.to).toEqual([{ email: 'a@b.nl' }]);
    expect(body.subject).toBe('POGO - Your code is 064242');
    expect(body.htmlContent).toContain('https://x.nl/mail-hero.png');
    expect(body.htmlContent).not.toContain('cid:hero');
  });

  it('leaves the image out without a public url, and throws on an API error', async () => {
    const fetchMock = ok();
    await createBrevoMailer('k', 'hi@maruha.nl', '', fetchMock).send(
      codeMail('a@b.nl', 'register', '1'),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.htmlContent).not.toContain('cid:hero');
    const bad = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(
      createBrevoMailer('k', 'hi@maruha.nl', '', bad).send(codeMail('a@b.nl', 'register', '1')),
    ).rejects.toThrow(/Brevo 401/);
  });
});
