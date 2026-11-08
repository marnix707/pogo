---
name: list-tickets
description: Show the open Pogo bug reports and feedback tickets, grouped by type (bugs, feedback) and sorted by criticality. Use for "/list-tickets", "what tickets are open", "show the ticket board".
---

# list-tickets

Run `node .claude/skills/fix-ticket/ticket.mjs board` and show its output as is (it needs `POGO_URL` and `TICKET_API_TOKEN`, see the fix-ticket skill).

- Bugs come first, then feedback; inside each, the most critical first (critical, high, medium, low, unrated), oldest first inside a level.
- `--asc` reverses the order (least critical first); `--all` also lists the closed / fixed ones.
- Each row starts with the first 8 characters of the id: `/fix-ticket <those 8>` works.

After the list, say in one or two lines which tickets look related (duplicates) and which you would take first. Do not start fixing anything unless asked.
