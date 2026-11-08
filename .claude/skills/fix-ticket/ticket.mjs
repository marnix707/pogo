#!/usr/bin/env node
// Talks to the Pogo ticket API (the admin panel's "Tickets") for the fix-ticket skill.
//   node ticket.mjs list [status|open]        queued tickets by default
//   node ticket.mjs board [--asc] [--all]     every open ticket by category (bugs / feedback), most critical first
//   node ticket.mjs get <id> <outDir>         writes ticket.json (+ screenshot.jpg) and prints a summary
//   node ticket.mjs set <id> <status> [note]  moves it along (in_progress / fixed / wontfix ...), note = claudeNote
// Env: POGO_URL (e.g. https://pogo.example.com or http://localhost:3000), TICKET_API_TOKEN.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.POGO_URL ?? '').replace(/\/+$/, '');
const token = process.env.TICKET_API_TOKEN ?? '';
if (!base || !token) {
  console.error('Set POGO_URL and TICKET_API_TOKEN (the secret from the server settings).');
  process.exit(2);
}
const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res;
};

const args = process.argv.slice(2);
const flags = args.filter((x) => x.startsWith('--'));
const [cmd, a0, b, c] = args.filter((x) => !x.startsWith('--'));
// (an id may be given as its first 8 characters)
const fullId = async (id) => {
  if (!id || id.length >= 32) return id;
  const { tickets } = await (await api('GET', '/api/admin/tickets')).json();
  const hit = tickets.filter((t) => t.id.startsWith(id));
  if (hit.length !== 1) throw new Error(`${hit.length ? 'ambiguous' : 'unknown'} ticket id ${id}`);
  return hit[0].id;
};
const a = cmd === 'get' || cmd === 'set' ? await fullId(a0) : a0;

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

if (cmd === 'board') {
  const { tickets } = await (await api('GET', `/api/admin/tickets${flags.includes('--all') ? '' : '?open=1'}`)).json();
  const sign = flags.includes('--asc') ? -1 : 1;
  // bugs by criticality (no priority = least), feedback and the rest by age; oldest first inside a level
  const byLevel = (x, y) =>
    sign * ((RANK[x.priority] ?? 4) - (RANK[y.priority] ?? 4)) || x.createdAt - y.createdAt;
  const groups = [
    ['BUGS', tickets.filter((t) => t.type === 'bug').sort(byLevel)],
    ['FEEDBACK', tickets.filter((t) => t.type === 'feedback').sort(byLevel)],
    ['OTHER', tickets.filter((t) => t.type !== 'bug' && t.type !== 'feedback').sort(byLevel)],
  ];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    console.log(`\n== ${title} (${list.length}) ==`);
    let level = null;
    for (const t of list) {
      const lv = (t.priority ?? 'unrated').toUpperCase();
      if (lv !== level) console.log(`  ${(level = lv)}`);
      const where = t.gameId ? t.gameId : t.screen;
      console.log(
        `    ${t.id.slice(0, 8)}  ${t.status.padEnd(11)} ${ago(t.createdAt).padStart(3)}  ${where.padEnd(10)} ${t.message.slice(0, 80).replace(/\s+/g, ' ')}`,
      );
    }
  }
  if (tickets.length === 0) console.log('(no tickets)');
  else console.log(`\n${tickets.length} tickets. Fix one with /fix-ticket <id>.`);
} else if (cmd === 'list') {
  const q = a === 'open' ? '?open=1' : `?status=${a ?? 'queued'}`;
  const { tickets } = await (await api('GET', `/api/admin/tickets${q}`)).json();
  for (const t of tickets)
    console.log(`${t.id}  ${t.status.padEnd(11)} ${(t.priority ?? '-').padEnd(8)} ${t.type.padEnd(8)} ${t.screen}${t.gameId ? '/' + t.gameId : ''}  ${t.message.slice(0, 70).replace(/\s+/g, ' ')}`);
  if (tickets.length === 0) console.log('(none)');
} else if (cmd === 'get' && a && b) {
  const { ticket } = await (await api('GET', `/api/admin/tickets/${a}`)).json();
  mkdirSync(b, { recursive: true });
  writeFileSync(join(b, 'ticket.json'), JSON.stringify(ticket, null, 2));
  if (ticket.hasScreenshot) {
    const img = Buffer.from(await (await api('GET', `/api/admin/tickets/${a}/screenshot`)).arrayBuffer());
    writeFileSync(join(b, 'screenshot.jpg'), img);
  }
  console.log(`${ticket.type} / ${ticket.priority ?? '-'} / ${ticket.status} / screen ${ticket.screen}${ticket.gameId ? ' / game ' + ticket.gameId : ''}`);
  console.log(`from ${ticket.nickname}, ${new Date(ticket.createdAt).toISOString()}`);
  console.log(`\n${ticket.message}\n`);
  if (ticket.adminNote) console.log(`admin note: ${ticket.adminNote}\n`);
  const errs = ticket.client?.errors ?? [];
  if (errs.length) console.log(`client errors:\n${errs.map((e) => '  ' + e.kind + ': ' + e.message).join('\n')}\n`);
  console.log(`saved: ${join(b, 'ticket.json')}${ticket.hasScreenshot ? ' and screenshot.jpg' : ''}`);
} else if (cmd === 'set' && a && b) {
  const patch = { status: b, ...(c ? { claudeNote: c } : {}) };
  const { ticket } = await (await api('PATCH', `/api/admin/tickets/${a}`, patch)).json();
  console.log(`${ticket.id} is now ${ticket.status}`);
} else {
  console.error('usage: ticket.mjs board [--asc] [--all] | list [status|open] | get <id> <outDir> | set <id> <status> [note]');
  process.exit(2);
}
