# Pogo

Mobile-first multiplayer game hub (Plato-style): quick turn-based games with friends/strangers plus chat. First game: **Yatzy** (use "Yatzy" in the UI, never "Yahtzee"). Games are plug-ins; the core server/room/chat code must contain **no game-specific code**.

## Stack

TypeScript (strict) everywhere · pnpm workspaces · React 18 + Vite + Tailwind (PWA later) · Node 20 + Fastify + Socket.IO · PostgreSQL + Prisma · Zod for every inbound message/request · Vitest (unit) · Playwright (e2e, M4+) · ESLint + Prettier.

## Layout

```
apps/web        React/Vite client (dev server proxies /api and /socket.io to the server → one origin for phones)
apps/server     Fastify REST under /api + Socket.IO on the same HTTP server; Prisma in prisma/
packages/shared Types, Zod protocol schemas, GameDefinition interface, pure game logic (games/<id>)
docker/         Dev entrypoints   scripts/  Host helper scripts
```

Game plug-in split: pure logic in `packages/shared/src/games/<id>`, UI in `apps/web/src/games/<id>`, logic registry in `packages/shared/src/games/registry.ts` (`getGame(id)`), UI registry in `apps/web/src/games/registry.ts`. Rooms only see `GameDefinition` (createInitialState, validateMove, applyMove, getPlayerView, getCurrentPlayers, isGameOver, getResults, optional autoMove). Randomness is always an injected `Rng` (server: `crypto`; tests: `createSeededRng` / scripted `createDiceRng` from shared). `autoMove` is called repeatedly by the server until the timed-out player is no longer to move.

## Yatzy (packages/shared/src/games/yatzy)

Moves: `{type:'roll', held:boolean[5]}` (holds are sent with the roll; ignored on the first roll) and `{type:'score', category}`. Standard Joker rules: with Yatzy box filled, a further Yatzy forces the matching upper box, else any open lower box (full house/straights at full value), else any upper box for 0; +100 only if the Yatzy box holds 50. `getPreviewScores` drives the UI score preview.

## Realtime server (apps/server)

- `buildApp(deps)` in `src/app.ts` wires Fastify + Socket.IO + `RoomManager`; `index.ts` injects Prisma user store, crypto Rng and config (`loadConfig`). Tests inject an in-memory user store and seeded Rng.
- Identity: `POST /api/auth/guest {nickname, avatar}` → `{token, user}` (JWT, 90d; client keeps it in localStorage key `pogo.token`); `GET/PATCH /api/me`. Sockets authenticate with `auth: {token}` in the handshake.
- Rooms (`src/rooms`): `RoomManager` (code → `Room`, one room per user) and `Room` (members, settings, lifecycle, timers). They only use `GameDefinition`; tests use a fake game (`rooms/testGame.ts`) to prove it.
- Protocol (`packages/shared/src/protocol`): client emits `room:create|join|leave|kick|settings|start|rematch` and `game:move` with Zod-validated payloads and an ack `Result`; server pushes `room:state` (per-player filtered `RoomView`, or `null` + reason when you are no longer in a room) on every change and on (re)connect.
- Presence: a user is connected while ≥1 socket is open. Lobby: disconnected members are dropped after `DISCONNECT_GRACE_SEC`. In game: seat is kept; if every current player is absent for the grace period, or the turn timer (`TURN_TIME_SEC`, per-room `turnTimeSec`, 0 = off) runs out, the server auto-plays via `autoMove` (multi-step turns are paced ~1.2s apart). Rooms nobody is connected to are deleted after `ROOM_TTL_SEC`.
- Rate limiting: REST via `@fastify/rate-limit`; sockets via a per-socket token bucket (20 burst, 10/s).
- `apps/web/src/Playground.tsx` is a temporary dev UI (create/join/start/play Yatzy, share link `/?join=CODE`); the real UI replaces it in M4.

## Conventions

- Server-authoritative: clients send intents only; validate with Zod, then with the game's `validateMove`.
- Live room/game state is in-memory; only users/stats are persisted in Postgres.
- Shared package is consumed as TS source (no build step). Use `import type` for types.
- Small focused commits, clear messages. Never commit `.env`.
- Keep this file updated as the project evolves.

## Running (everything runs in Docker; host needs only Docker + make)

- `make up` – build + start detached (creates `.env` from `.env.example`, detects LAN IPs) and prints URLs
- `make down` / `make logs` / `make ps` / `make urls`
- `make test` · `make lint` · `make typecheck` · `make format`
- `make migrate` · `make db-reset` (destructive) · `make db-shell` · `make shell`
- `make lock` – regenerate `pnpm-lock.yaml` after editing any package.json (then `make up` to rebuild)
- Plain `docker compose up --build --renew-anon-volumes` also works; use `HOST_LAN_IPS=<ip>` to have the server print phone URLs.
- Web: http://localhost:5173 · API: http://localhost:3000/api/healthz · DB: 127.0.0.1:5433
- Phone: open `http://<LAN-IP>:5173` (printed by `make up`). With WSL mirrored mode you may need a Windows firewall inbound rule for TCP 5173 and 3000.
- node_modules live in container-only anonymous volumes; `--renew-anon-volumes` refreshes them after dependency changes.
- File watching uses polling (`CHOKIDAR_USEPOLLING=true`) for reliable hot reload on WSL/Docker.

## Milestones

1 Scaffold + Docker (done) · 2 Shared types/plug-in interface/Yatzy logic + tests (done) · 3 Realtime server (guests, rooms, reconnect) (done) · 4 Mobile Yatzy UI + e2e · 5 Public lobby + chat · 6 Accounts, stats, PWA · 7 Production Docker + deploy guide.
Work one milestone at a time; at the end run tests, verify in Docker, commit, summarize, explain phone testing, wait for go-ahead.
