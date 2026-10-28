# Pet Match

(Detail moved out of CLAUDE.md: read this when working on the area. Keep it updated with changes.)

A two-player match-3 monster duel, modelled on Plato's "Match Monsters". Game id `matchmates`, shown as "Pet Match".

## Logic (`packages/shared/src/games/matchmates`)

- `types.ts` (board 7x5 (7 wide, 5 high), `MatesState` / `MatesView` / `MateEvent`), `board.ts` (find matches, swap, drop and refill, pure), `monsters.ts` (data catalogue: `MONSTERS`, `STAGE_SPECS`), `game.ts` (`GameDefinition`), `game.test.ts`.
- **Phases:** `pick` then `play` then `over`. **Draft** (turn based, every pet a different element): the first drafter (`draftFirst`, random) takes 1 pet, the second takes 2, the first takes the last one (`draftTurn`, `DRAFT_ORDER`). Then both name an arena (a stage or `random`) and **confirm** at the same time (one shared clock via `keepsClock`; the opponent's arena choice stays hidden). When both have confirmed a **coin** (`COIN_MS`, `Coin.tsx`) is flipped: the winner's arena is used (`random` = the dice pick one), the winner **plays second** and starts with +5 HP (60 / 65). `settleMs` / `clockBonusMs` cover the coin.
- **Turn:** 2 moves: `swap {a,b}` (any two neighbouring, unfrozen tiles; **a swap that matches nothing keeps the tiles swapped and loses the whole turn**, `MateEvent.noMatch`), `evolve {slot}` (4 berries, forest stage 3; **takes the whole turn**) and `boost {slot}` (evolved monster, 4 berries, +4 mana; one move). A 4+ line gives an extra move (once per turn), a 5+ line also heals 5 (`COMBO_HEAL`, `MateEvent.heal`); option `matchBonus` gives an extra move for every such line and a 6+ line deals 5.
- **Hit points:** option `hp` (100 default, 125 / 150 / 200: `HP_CHOICES`, picked by the host in the lobby `LobbyOptions`); the coin winner gets +5.
- **Mana** only goes to the mover's own monsters of that element; a full bar fires the special at once (numbers in `monsters.ts`, damage normal / evolved): earth 10/15 and heals the same; fire 20/25 and a random column (evolved 2 columns) counts as matched; water 10/20 and 3 random tiles turn to water; electric 5/10 and a random 2x2 (evolved 3x2) block counts as matched; psychic 10/15 and drains 2 (evolved 3) mana from every monster of the opponent. Cleared columns / blocks are a step with `ability: true`, so they pay mana / berries and cascade.
- **Stages:** stadium, forest (cheaper evolve), lava (each matched fire tile hurts), frost (other tiles of the matched kinds freeze, max 2 kinds, thaw after the next move; thaw instead of a reshuffle when frozen tiles are all that blocks a move), reactor (bombs, fuse 3, tick every swap, blow a cross of radius 2, max 2), swamp (one tile is hidden behind "?" each turn; `getPlayerView` masks it). Reactor and swamp use the Stadium art.
- `MateEvent` (`lastEvent`) carries `swapped`, `noMatch`, `heal`, `extraMove`, every cascade `steps` (cleared squares + the board after the fall) and `fires`, so clients replay a move; `settleMs` = swap + steps + fires time (computers wait for it).
- **Computer:** `autoMove` tries every legal swap / evolve / boost on a copy (seeded Rng) and keeps the best by `evaluate`; also picks monsters and stage.

## UI (`apps/web/src/games/matchmates`)

`MatchMatesGame` (HP / berries, arena with the monsters on the two pads, mana bars, moves, evolve / boost buttons, 7x5 (7 wide, 5 high) board with tap-tap or slide; replays `lastEvent` unless reduced motion), `Pick` (draft + arena + Confirm), `Coin`, `LobbyOptions` (Match bonus switch), `MatchMatesRules`, `art.ts`. The logo `assets/sprites/brand/logos/match-mates.svg` is the artist's (delivered as `pet-match.svg`).

## Art

`apps/web/src/assets/sprites/matchmates/{tiles,monsters,arenas}` from the artist's `monster_match_svg.zip` (tiles 18x18, monsters 26x27 base / 32x33 evolved, facing right: the opponent is mirrored; arenas 160x90 with pads player (44,76), opponent (116,58)). Only the five monsters with art exist; add more by data (`MONSTERS`) plus art.

## Errors

Area `MATE` in `errors.ts`.

## Animation and sound

Cleared tiles pop, the rest fall into the holes with a small bounce (`dropsFor`, `mates-fall`), new tiles come from above. Every chain link plays a higher, longer casino-style run (`chainSound` in `lib/sound.ts`), shows "CHAIN xN!", sparks / coins fly, and the board shakes from x3. Reduced motion skips the replay.

## Event animation (web)

- Swapping: the two tiles slide to each other's place (`mates-slide`, CSS vars `--sx/--sy`).
- Like Yatzy's dice: cleared tiles of a mover's element fly to that monster's mana bar (berries to the berry counter), staggered, and a white running total `+n` pops where they land (`flights`, `tallies`, tick sounds); the flown squares do not pop on the board.
- Texts (`mates-note` on the board): attack effects (`MONSTERS[e].effect`), "Line of N: +5 HP!", "Extra move!", "No match: turn lost!", "<pet> is evolving..." / "<evolved name>!". Floating numbers: -damage, green +heal, -N mana.
- Evolve (`EVOLVE_MS`): the old form charges (glow, shake, rising notes), flashes white, the new form pops out with sparks. `settleMs` includes `EVOLVE_MS` and `NOTE_MS` so computers wait.
