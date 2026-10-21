import { describe, expect, it } from 'vitest';
import { codeMail } from './template';

describe('codeMail', () => {
  it('carries the code in text and html, and attaches the inline hero image', () => {
    const m = codeMail('a@b.nl', 'register', '123456');
    expect(m.text).toContain('123456');
    expect(m.html).toContain('cid:hero');
    for (const d of '123456') expect(m.html).toContain(`>${d}</div>`);
    expect(m.attachments?.[0]?.cid).toBe('hero');
    expect(m.attachments?.[0]?.content.subarray(1, 4).toString()).toBe('PNG');
  });

  it('has its own subject for a password reset', () => {
    expect(codeMail('a@b.nl', 'reset', '000000').subject).toMatch(/reset code is 000000/i);
    expect(codeMail('a@b.nl', 'register', '064242').subject).toBe('POGO - Your code is 064242');
  });
});
