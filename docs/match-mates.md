# Pet Match

(Detail moved out of CLAUDE.md: read this when working on the area. Keep it updated with changes.)

A two-player match-3 monster duel, modelled on Plato's "Match Monsters". Game id `matchmates`, shown as "Pet Match".

## Logic (`packages/shared/src/games/matchmates`)

- `types.ts` (board 8x8, `MatesState` / `MatesView` / `MateEvent`), `board.ts` (find matches, swap, drop and refill, pure), `monsters.ts` (data catalogue: `MONSTERS`, `STAGE_SPECS`), `game.ts` (`GameDefinition`), `game.test.ts`.
- **Phases:** `pick` (both pick two different elements and a stage at the same time, one shared clock via `keepsClock`) then `play` then `over`. Differing stage picks: the Rng chooses. Second player has +5 HP (60 / 65). Hidden while picking: the opponent's choice.
- **Turn:** 2 moves: `swap {a,b}` (must make a match, frozen tiles cannot move), `evolve {slot}` (4 berries, forest stage 3) and `boost {slot}` (evolved monster, 4 berries, +4 mana) each cost one move. A 4+ line gives an extra move (once per turn; option `matchBonus` gives one for every such line, 5+ heals 5, 6+ deals 5).
- **Mana** only goes to the mover's own monsters of that element; a full bar fires the special at once (damage and an effect per element: water turns tiles into water, earth grows berries, electric takes a move from the opponent's next turn, psychic steals berries and mana). Numbers are in `monsters.ts`.
- **Stages:** stadium, forest (cheaper evolve), lava (each matched fire tile hurts), frost (other tiles of the matched kinds freeze, max 2 kinds, thaw after the next move; thaw instead of a reshuffle when frozen tiles are all that blocks a move), reactor (bombs, fuse 3, tick every swap, blow a cross of radius 2, max 2), swamp (one tile is hidden behind "?" each turn; `getPlayerView` masks it). Reactor and swamp use the Stadium art.
- `MateEvent` (`lastEvent`) carries `swapped`, every cascade `steps` (cleared squares + the board after the fall) and `fires`, so clients replay a move; `settleMs` = swap + steps + fires time (computers wait for it).
- **Computer:** `autoMove` tries every legal swap / evolve / boost on a copy (seeded Rng) and keeps the best by `evaluate`; also picks monsters and stage.

## UI (`apps/web/src/games/matchmates`)

`MatchMatesGame` (HP / berries, arena with the monsters on the two pads, mana bars, moves, evolve / boost buttons, 8x8 board with tap-tap or slide; replays `lastEvent` unless reduced motion), `Pick`, `LobbyOptions` (Match bonus switch), `MatchMatesRules`, `art.ts`. The logo `assets/sprites/brand/logos/match-mates.svg` is the artist's (delivered as `pet-match.svg`).

## Art

`apps/web/src/assets/sprites/matchmates/{tiles,monsters,arenas}` from the artist's `monster_match_svg.zip` (tiles 18x18, monsters 26x27 base / 32x33 evolved, facing right: the opponent is mirrored; arenas 160x90 with pads player (44,76), opponent (116,58)). Only the five monsters with art exist; add more by data (`MONSTERS`) plus art.

## Errors

Area `MATE` in `errors.ts`.
