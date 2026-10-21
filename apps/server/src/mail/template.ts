import type { CodePurpose } from '../auth/userStore';
import { HERO_PNG_BASE64 } from './art';
import type { Mail } from './mailer';

const COPY: Record<CodePurpose, { subject: string; title: string; intro: string }> = {
  register: {
    subject: 'Your POGO code',
    title: 'Welcome to POGO!',
    intro: 'Enter this code in the app to save your stats and join the leaderboard.',
  },
  reset: {
    subject: 'Reset your POGO password',
    title: 'New password?',
    intro: 'Enter this code in the app to choose a new password.',
  },
};

// The palette of the app (see CLAUDE.md, Visual design).
const C = {
  page: '#1f4f8c',
  panel: '#233049',
  line: '#101628',
  gold: '#fda200',
  cream: '#f7f1e4',
  ink: '#101628',
  muted: '#b9becb',
};
const FONT = "'Courier New', Courier, monospace";

/** One digit as a small cream tile with a dark outline and a hard lip (like the dice). */
const digit = (d: string) =>
  `<td style="padding:0 3px;"><div style="width:42px;height:54px;line-height:54px;text-align:center;` +
  `background:${C.cream};color:${C.ink};border:3px solid ${C.line};border-bottom-width:7px;border-radius:6px;` +
  `font:bold 30px/54px ${FONT};">${d}</div></td>`;

/**
 * The emailed code, as a nice HTML mail (table layout, inline styles: mail clients ignore the rest)
 * with the pixel-art key art attached inline (`cid:hero`: Gmail and others block SVG, PNG is fine) and
 * a plain-text version that carries the same code (also what the dev mail log and the e2e tests read).
 */
export function codeMail(to: string, purpose: CodePurpose, code: string): Mail {
  const copy = COPY[purpose];
  const text = `Your POGO code is ${code}. It is valid for 10 minutes. If you did not ask for it, ignore this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>${copy.subject}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your POGO code is ${code}. Valid for 10 minutes.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:${C.panel};border:4px solid ${C.line};border-radius:14px;border-collapse:separate;">
    <tr><td style="height:10px;background:${C.gold};border-radius:10px 10px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center" style="padding:26px 20px 6px;">
      <img src="cid:hero" width="240" height="258" alt="POGO" style="display:block;border:0;width:240px;max-width:70%;height:auto;image-rendering:pixelated;">
    </td></tr>
    <tr><td align="center" style="padding:6px 24px 4px;font:bold 22px/1.3 ${FONT};color:${C.gold};letter-spacing:2px;text-transform:uppercase;">${copy.title}</td></tr>
    <tr><td align="center" style="padding:6px 28px 18px;font:15px/1.5 ${FONT};color:${C.cream};">${copy.intro}</td></tr>
    <tr><td align="center" style="padding:0 12px 8px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>${[...code].map(digit).join('')}</tr></table>
    </td></tr>
    <tr><td align="center" style="padding:14px 28px 6px;font:13px/1.5 ${FONT};color:${C.muted};">The code is valid for 10 minutes.</td></tr>
    <tr><td style="padding:14px 28px 0;"><div style="border-top:3px dotted #3a4a6b;font-size:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td align="center" style="padding:14px 28px 24px;font:12px/1.5 ${FONT};color:${C.muted};">
      Did not ask for this? Just ignore this email, nothing will happen.<br>
      <span style="color:${C.gold};font-weight:bold;letter-spacing:2px;">POGO</span> &middot; Play Online, GO!
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  return {
    to,
    subject: copy.subject,
    text,
    html,
    attachments: [
      { filename: 'pogo.png', content: Buffer.from(HERO_PNG_BASE64, 'base64'), cid: 'hero' },
    ],
  };
}
