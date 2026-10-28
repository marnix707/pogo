# Pet Match

(Detail moved out of CLAUDE.md: read this when working on the area. Keep it updated with changes.)

A two-player match-3 monster duel, modelled on Plato's "Match Monsters". Game id `matchmates`, shown as "Pet Match".

## Logic (`packages/shared/src/games/matchmates`)

- `types.ts` (board 7x5 (7 wide, 5 high), `MatesState` / `MatesView` / `MateEvent`), `board.ts` (find matches, swap, drop and refill, pure), `monsters.ts` (data catalogue: `MONSTERS`, `STAGE_SPECS`), `game.ts` (`GameDefinition`), `game.test.ts`.
- **Phases:** `pick` then `play` then `over`. **Draft** (turn based, every pet a different element): the first drafter (`draftFirst`, random) takes 1 pet, the second takes 2, the first takes the last one (`draftTurn`, `DRAFT_ORDER`). Then both name an arena (a stage or `random`) and **confirm** at the same time (one shared clock via `keepsClock`; the opponent's arena choice stays hidden). When both have confirmed a **coin** (`COIN_MS`, `Coin.tsx`) is flipped: the winner's arena is used (`random` = the dice pick one), the winner **plays second** and starts with +5 HP (60 / 65). `settleMs` / `clockBonusMs` cover the coin.
- **Turn:** 2 moves: `swap {a,b}` (must make a match, frozen tiles cannot move), `evolve {slot}` (4 berries, forest stage 3) and `boost {slot}` (evolved monster, 4 berries, +4 mana) each cost one move. A 4+ line gives an extra move (once per turn; option `matchBonus` gives one for every such line, 5+ heals 5, 6+ deals 5).
- **Mana** only goes to the mover's own monsters of that element; a full bar fires the special at once (damage and an effect per element: water turns tiles into water, earth grows berries, electric takes a move from the opponent's next turn, psychic steals berries and mana). Numbers are in `monsters.ts`.
- **Stages:** stadium, forest (cheaper evolve), lava (each matched fire tile hurts), frost (other tiles of the matched kinds freeze, max 2 kinds, thaw after the next move; thaw instead of a reshuffle when frozen tiles are all that blocks a move), reactor (bombs, fuse 3, tick every swap, blow a cross of radius 2, max 2), swamp (one tile is hidden behind "?" each turn; `getPlayerView` masks it). Reactor and swamp use the Stadium art.
- `MateEvent` (`lastEvent`) carries `swapped`, every cascade `steps` (cleared squares + the board after the fall) and `fires`, so clients replay a move; `settleMs` = swap + steps + fires time (computers wait for it).
- **Computer:** `autoMove` tries every legal swap / evolve / boost on a copy (seeded Rng) and keeps the best by `evaluate`; also picks monsters and stage.

## UI (`apps/web/src/games/matchmates`)

`MatchMatesGame` (HP / berries, arena with the monsters on the two pads, mana bars, moves, evolve / boost buttons, 7x5 (7 wide, 5 high) board with tap-tap or slide; replays `lastEvent` unless reduced motion), `Pick` (draft + arena + Confirm), `Coin`, `LobbyOptions` (Match bonus switch), `MatchMatesRules`, `art.ts`. The logo `assets/sprites/brand/logos/match-mates.svg` is the artist's (delivered as `pet-match.svg`).

## Art

`apps/web/src/assets/sprites/matchmates/{tiles,monsters,arenas}` from the artist's `monster_match_svg.zip` (tiles 18x18, monsters 26x27 base / 32x33 evolved, facing right: the opponent is mirrored; arenas 160x90 with pads player (44,76), opponent (116,58)). Only the five monsters with art exist; add more by data (`MONSTERS`) plus art.

## Errors

Area `MATE` in `errors.ts`.

## Animation and sound

Cleared tiles pop, the rest fall into the holes with a small bounce (`dropsFor`, `mates-fall`), new tiles come from above. Every chain link plays a higher, longer casino-style run (`chainSound` in `lib/sound.ts`), shows "CHAIN xN!", sparks / coins fly, and the board shakes from x3. Reduced motion skips the replay.
