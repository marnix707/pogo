---
name: fix-ticket
description: Pick up a Pogo bug report / feedback ticket (from the admin panel's Tickets, "Fix with Claude"), reproduce it from the captured state, fix it with tests, and move the ticket along. Use for "/fix-ticket <id>" or "fix the queued tickets".
---

# fix-ticket

Tickets are bug reports and feedback players send from the app. Each has the player's text, a screenshot, the **client state** (screen, room view, settings, recent errors, per-game extras) and, for a game, the **server state** (authoritative game state, last moves, chat) taken when it was sent. The admin panel's **Fix with Claude** button queues a ticket and copies `/fix-ticket <id>`.

## Setup (once)
The script needs `POGO_URL` (the server's address, e.g. `http://localhost:3000` or the Render URL) and `TICKET_API_TOKEN` (the same secret as the server's `TICKET_API_TOKEN` setting; it can only read tickets and move their status). Put them in `.claude/settings.local.json` under `env`, or export them in the shell. Never commit the token.

## Overview
`node .claude/skills/fix-ticket/ticket.mjs board` (or `/list-tickets`) lists the open tickets by type and criticality; ids can be given as their first 8 characters.

## Workflow
1. `node .claude/skills/fix-ticket/ticket.mjs list` shows the queued tickets (`list open` shows every open one). With an id in the prompt, use that one.
2. `node .claude/skills/fix-ticket/ticket.mjs get <id> <scratchpad>/ticket-<id>` writes `ticket.json` and `screenshot.jpg` there and prints a summary. **Read the screenshot** (Read tool) and the JSON: `client.room` is what the player saw, `server.state` + `server.lastMoves` is what the server had (game logic lives in `packages/shared/src/games/<id>`, UI in `apps/web/src/games/<id>`: read `CLAUDE.md` and the matching `docs/` file first).
3. `node .claude/skills/fix-ticket/ticket.mjs set <id> in_progress` before starting.
4. Reproduce: load the captured `server.state` into a test with the game's pure functions (`createInitialState` / `applyMove` / `getPlayerView`), or read the UI code path for the `client.screen`. Find the cause. A ticket can be feedback (an idea): then plan it, do not just build it; ask the user.
5. Fix it with a test that fails before and passes after; run `make typecheck`, `make test`, `make lint`; update the matching `docs/` file. Commit locally (push only when the user says "push").
6. `node .claude/skills/fix-ticket/ticket.mjs set <id> fixed "<one or two sentences: cause, fix, commit hash>"`. If it cannot be reproduced or is a duplicate: `set <id> wontfix|duplicate "<why>"` and tell the user.
7. Tell the user what you found and changed. The ticket stays `fixed` until the admin closes it after checking.

Player data in tickets is private: do not paste it into commits, tests or docs beyond what the fix needs (use made-up names).
