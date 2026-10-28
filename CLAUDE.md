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


## Where the details are (read the file before working on that area; update it when you change the area)

CLAUDE.md is kept short on purpose (it is loaded in every session). Feature detail lives in `docs/`:

| File | Read it for |
| --- | --- |
| `docs/web-app.md` | web screens: Shell, Home, lobby (ready / lock / countdown / auto next game), Yatzy UI and scoring animation, results screen, PWA + update notice, visual design / palette / font, Home opening animation, chat banner, menu boxes |
| `docs/yatzy.md` | Yatzy rules and modes (turn based / live) in `packages/shared` |
| `docs/karma.md` | Karma rules, modes and rules catalogue, card animation, controls, tutorial, round screen, win / blind reveals |
| `docs/last-card.md` | Last Card rules, Last Card! race, shield / ghost / skull, card art and animations |
| `docs/sea-battle.md` | Sea Battle logic, screen, placing, shots, sinking, radar |
| `docs/match-mates.md`     | Pet Match rules (match-3 monster duel), stages, monsters, computer player, UI, art |
| `docs/lobby-chat-bots.md` | public lobby list, room chat and profanity filter, computer players |
| `docs/accounts-admin.md` | guests / accounts / mail codes / recovery links / stats / leaderboard / avatars, admin panel, roles, bans, dev tag, titles |
| `docs/friends.md` | friends, profiles, private messages, mute / block, game invites |
| `docs/security.md` | dev stack binding, secrets, headers + CSP, proxy hops, brute-force limits, dependency policy |
| `docs/assets.md` | the artist's pixel-art packs, the `unsorted/` inbox workflow, icons, sfx |

## Rules that bite (short; the files above have the why)

- **Games are plug-ins**: pure logic in `packages/shared/src/games/<id>` (+ registry), UI in `apps/web/src/games/<id>` (+ registry); the core server / room code has no game-specific code. **Every new game starts with the turn timer Off** (no environment setting; the host picks one in the lobby), uses `useTimeWarning` if it has a clock, and needs a logo in `assets/sprites/brand/logos/`.
- **Every server error text needs a code** in `packages/shared/src/protocol/errors.ts` (one message, one code; `errors.test.ts` fails otherwise).
- **Tests with cards or sheets**: e2e runs with reduced motion (Karma tutorial / animations are off there); tap overlapped hand cards on their left strip; wait for `getByRole('dialog')` count 0 between sheets. Accounts / admin / friends e2e need the server on `MAIL_MODE=log` (the dev mailbox).
- **After changing `schema.prisma`**: regenerate the Prisma client in the same container before typecheck, and in the **running** dev server (see `docs/friends.md`), or you get stale-client errors.
- **Render**: never put a `value:` on a dashboard-tunable env key in `render.yaml` (see Deployment).
- **Pictures** are always the `Avatar` tile; names in JSX go through `PlayerName` (dev tag).
- **Docker / ports**: the dev stack is localhost-only (`make up`), `make up-lan` for phones; host ports can move with `HOST_SERVER_PORT` / `HOST_WEB_PORT` (`docs/security.md`).
- Standing user rules live in the memory directory (push only when told; UI-only changes need no e2e).

## Realtime server (apps/server)

- `buildApp(deps)` in `src/app.ts` wires Fastify + Socket.IO + `RoomManager`; `index.ts` injects Prisma user store, crypto Rng and config (`loadConfig`). Tests inject an in-memory user store and seeded Rng.
- Identity: `POST /api/auth/guest {nickname, avatar}` → `{token, user}` (JWT, 90d; client keeps it in localStorage key `pogo.token`); `GET/PATCH /api/me`. Sockets authenticate with `auth: {token}` in the handshake.
- Rooms (`src/rooms`): `RoomManager` (code → `Room`, one room per user) and `Room` (members, settings, lifecycle, timers). They only use `GameDefinition`; tests use a fake game (`rooms/testGame.ts`) to prove it.
- Protocol (`packages/shared/src/protocol`): client emits `room:create|join|leave|kick|settings|start|rematch` and `game:move` with Zod-validated payloads and an ack `Result`; server pushes `room:state` (per-player filtered `RoomView`, or `null` + reason when you are no longer in a room) on every change and on (re)connect.
- Presence: a user is connected while ≥1 socket is open. Lobby: disconnected members are dropped after `DISCONNECT_GRACE_SEC`. In game: seat is kept; with a turn timer, if every current player is absent for the grace period (with unlimited time (`turnTimeSec` 0) nothing is ever auto-played for people who are merely disconnected; only players who left the room are still played for), or the turn timer (per-room `turnTimeSec`; **every new room starts with it Off for every game, there is no environment setting for it any more**: the host picks one in the lobby) runs out, the server auto-plays via `autoMove` (multi-step turns are paced ~1.2s apart). Rooms nobody is connected to are deleted after `ROOM_TTL_SEC`.
- Clock hooks on `GameDefinition` (all optional): `isFreeMove(move)` (a move that does not restart the turn clock), `keepsClock(before, after)` (the clock keeps running across the move: Karma's card swap has **one deadline for the whole phase**, started when the phase starts; no swap/Ready by anybody, computers included, resets it, and at the deadline everybody who is not ready is played by `autoMove` so the game starts), `clockBonusMs(state)` (extra time when the clock starts: Karma adds `rulesIntroMs(rules)` while the clients play the rules intro, so the swap time starts after the animation, during the tutorial). `Room.clockKept(before)` applies `keepsClock` in `move`, `autoplay` and `playBots`.
- **Playing alone**: a lone solo game (nobody else in the room, no computers, a game with `minPlayers` 1, i.e. Yatzy) has **no turn timer by default** (`Room.turnTime`: the effective timer; `RoomView.turnTimeSec` shows it, so the lobby's timer buttons read Off); once a second player joins the room default (Off) applies again, which is the same thing. A timer somebody picked explicitly (`turnTimeChosen`: `room:create {turnTimeSec}` or a `room:settings` change) is always used as picked. Karma etc. keep their default.
- **Test dice (developers only)**: the lobby Settings of a Yatzy room shows "Test dice: every roll a Yatzy (not recorded)" for `isDev` players; `room:settings {testDice}` (`Room.testDice`, `RoomView.testDice`, errors ROOM-126/127) makes the room use `createFixedRng(6)` (`packages/shared/src/game/testing.ts`) so every roll is a Yatzy (50, then +100 each: use it to see the flames and the 150/250 numbers), and `reportFinished` returns early, so a test game never reaches stats, the leaderboard or any future achievements. It resets when the game is switched; the game shows a red "Test game: not counted" tag (`test-game-tag`). Test: `RoomManager.test.ts`.
- Rate limiting: REST via `@fastify/rate-limit`; sockets via a per-socket token bucket (20 burst, 10/s).
- Share links look like `/?join=CODE` (handled by the web shell after sign-in).


## Error codes (troubleshooting)

- Every error shown to a player has a code behind the text: "Room not found (ROOM-101)". Unexpected server errors read "Something went wrong on our side (SYS-500 · ab12cd)": the 6-letter **ref** is also in the Render log line of that request (`ref`; for REST it is the request id, for sockets `newRef()`), so a screenshot is enough to find the cause. Anything not in the catalogue shows `SYS-000`.
- The catalogue is `packages/shared/src/protocol/errors.ts` (`KNOWN_ERRORS`: exact message or regex -> `AREA-NNN`; areas NET, SYS, MAIL, ACC, ADM, ROOM, GAME, YAT, KAR, LAST; 1xx = not allowed / the player's side, 5xx = ours). **To add an error: add its message to `KNOWN_ERRORS`**; `apps/server/src/errors.test.ts` scans the source for `error:`/`fail(`/`err(` string literals and fails for any message without a code. `failResult()` (used by `fail()` in `Room`/`RoomManager` and the socket handler) and a Fastify `preSerialization` hook in `app.ts` attach `code` to every socket ack and REST error body; the web shows `formatError(error, code, ref)` (`Shell` toasts, `lib/session.ts`, `admin/adminApi.ts`).
- Server errors: `app.setErrorHandler` answers anything thrown with `{error, code: 'SYS-500', ref}` and logs it with `code`/`ref` (the raw error never reaches the player); `AppError(status, code, message)` (`apps/server/src/errors.ts`) reports a chosen coded error. **Mail**: a failing send becomes a 502 with the friendly text "We couldn't send the email. Please try again in a minute." and a `MAIL` code from `mailFailure()`: MAIL-001 other/provider down, **MAIL-002 the provider refused our login or API key** (Brevo 401/403, SMTP EAUTH: check `BREVO_API_KEY`, it must be an API key `xkeysib-…`, not an SMTP key `xsmtpsib-…`), MAIL-003 the provider refused the mail (bad sender or address, Brevo 400), MAIL-004 unreachable/timeout (SMTP ports are blocked on Render's free tier), MAIL-006 provider rate limit, MAIL-005 dev mailbox empty. The log line carries the real cause in `cause`.


## Deployment (Render free tier + Neon, Frankfurt)

- `render.yaml` Blueprint → one Docker web service (`Dockerfile`, multi-stage: prod deps + Prisma client, web build, esbuild-bundled server). The server serves the built web app (`WEB_DIST_DIR`) with SPA fallback, so it is a single origin (no CORS/proxy). `docker/start.sh` runs `prisma migrate deploy` (retrying while Neon wakes), then `node dist/index.js`.
- Secrets are set in the Render dashboard (`sync: false`): `DATABASE_URL` (Neon, `?sslmode=require`; pooled hosts also need `&pgbouncer=true`) and optional `DIRECT_URL` (Neon direct string for migrations; defaults to `DATABASE_URL`). `JWT_SECRET` is generated by Render.
- **Never put a `value:` on a setting the owner tunes in the Render dashboard** (mail mode/sender, filters, timings): every deploy writes `render.yaml` values over the dashboard, which once reset `MAIL_MODE` to `log` and silently stopped all mail. Those keys are `sync: false` (asked for once, never overwritten); only fixed technical keys (`NODE_ENV`, `SERVER_PORT`, `LOG_LEVEL`, generated `JWT_SECRET`) carry a value. The code has defaults for all of them.
- Render health check is `/api/livez` (no DB access, so probes don't keep Neon awake); `/api/healthz` also checks the DB.
- Production runs with `trustProxy` so rate limits use the real client IP (set `TRUST_PROXY_HOPS` in the dashboard once the proxy chain length is known, see `docs/security.md`); only `/api` is rate limited.
- Free-tier caveats: spins down after 15 min without traffic (~1 min cold start); in-memory rooms are lost on restart/redeploy; single instance only.
- Test the prod image locally: `docker build -t pogo-prod .` then run it on the compose network with `DATABASE_URL` pointing at a scratch database.


## End-to-end tests (e2e/)

Standalone Playwright project (own `package.json`/lockfile, not part of the pnpm workspace) running in the official Playwright image against the compose stack: `make e2e` (= `docker compose --profile e2e run --rm e2e`, needs the stack up). It plays a full two-player Yatzy game with a mid-turn reload, plus a share-link join and kick test. Playwright version in `e2e/package.json`, `e2e/Dockerfile` must match.


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

1 Scaffold + Docker (done) · 2 Shared types/plug-in interface/Yatzy logic + tests (done) · 3 Realtime server (guests, rooms, reconnect) (done) · 4 Mobile Yatzy UI + e2e (done) · 5 Public lobby + chat (done) · 6 Accounts, stats, PWA (done: PWA install, accounts, stats, leaderboard, avatar upload, admin panel) · 7 Production Docker + deploy guide.
Work one milestone at a time; at the end run tests, verify in Docker, commit, summarize, explain phone testing, wait for go-ahead.


## Versions

- The release number is `apps/web/package.json` `version` (injected as `__APP_VERSION__` by `vite.config.ts`, `lib/version.ts`) and shown in Settings next to "Running in a browser tab" as "POGO v0.7.0 ALPHA" (`app-version`). Scheme: `0.MINOR.PATCH-alpha`: **MINOR** goes up for each batch of new features / a visible milestone, **PATCH** for fixes only, `-alpha` while the game is still changing a lot (then `-beta`, and no suffix at 1.0.0, the first public release). Bump it by hand in that one file when releasing (e.g. before a push that goes live) and keep a line here with what changed. Current: 0.7.0-alpha (M1-M6 done; four games (Yatzy, Karma, Last Card, Sea Battle; Pet Match in progress), accounts, admin panel, friends; deployed on Render).

