#!/usr/bin/env node
// Talks to the Pogo ticket API (the admin panel's "Tickets") for the fix-ticket skill.
//   node ticket.mjs list [status|open]        queued tickets by default
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

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'list') {
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
  console.error('usage: ticket.mjs list [status|open] | get <id> <outDir> | set <id> <status> [note]');
  process.exit(2);
}
