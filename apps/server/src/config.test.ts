import { describe, expect, it } from 'vitest';
import { loadConfig, smtpUrlFrom } from './config';

const base = { SMTP_PORT: 465, SMTP_USER: '', SMTP_PASSWORD: '', SMTP_URL: '', SMTP_HOST: '' };

describe('smtpUrlFrom', () => {
  it('builds a TLS url on 465 and encodes the credentials', () => {
    expect(
      smtpUrlFrom({
        ...base,
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'me@x.nl',
        SMTP_PASSWORD: 'p@ss:/#',
      }),
    ).toBe('smtps://me%40x.nl:p%40ss%3A%2F%23@smtp.example.com:465');
  });

  it('uses STARTTLS-style smtp on other ports and allows no login', () => {
    expect(smtpUrlFrom({ ...base, SMTP_HOST: 'localhost', SMTP_PORT: 1025 })).toBe(
      'smtp://localhost:1025',
    );
  });

  it('lets SMTP_URL win, and is empty without a host', () => {
    expect(smtpUrlFrom({ ...base, SMTP_HOST: 'h', SMTP_URL: 'smtps://a:b@c' })).toBe(
      'smtps://a:b@c',
    );
    expect(smtpUrlFrom(base)).toBe('');
  });
});

const required = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) };

describe('loadConfig mail', () => {
  it('refuses smtp mode without a server', () => {
    expect(() => loadConfig({ ...required, MAIL_MODE: 'smtp' } as NodeJS.ProcessEnv)).toThrow(
      /SMTP_HOST/,
    );
  });
  it('accepts the separate settings', () => {
    const c = loadConfig({
      ...required,
      MAIL_MODE: 'smtp',
      SMTP_HOST: 'h',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
    } as NodeJS.ProcessEnv);
    expect(c.smtpUrl).toBe('smtps://u:p@h:465');
  });
});

describe('loadConfig brevo key', () => {
  const required = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(40) };
  it('trims spaces, newlines and quotes around the API key', () => {
    const cfg = loadConfig({
      ...required,
      MAIL_MODE: 'brevo',
      BREVO_API_KEY: ' "xkeysib-abc123"\n',
    } as NodeJS.ProcessEnv);
    expect(cfg.brevoApiKey).toBe('xkeysib-abc123');
  });
});

describe('loadConfig proxy hops', () => {
  it('treats an empty value as unset and reads a number', () => {
    const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) };
    expect(
      loadConfig({ ...base, TRUST_PROXY_HOPS: '' } as NodeJS.ProcessEnv).trustProxyHops,
    ).toBeUndefined();
    expect(loadConfig({ ...base, TRUST_PROXY_HOPS: '2' } as NodeJS.ProcessEnv).trustProxyHops).toBe(
      2,
    );
  });
});
