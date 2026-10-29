# Pet Match

(Detail moved out of CLAUDE.md: read this when working on the area. Keep it updated with changes.)

A two-player match-3 monster duel, modelled on Plato's "Match Monsters". Game id `matchmates`, shown as "Pet Match".

## Logic (`packages/shared/src/games/matchmates`)

- `types.ts` (board 7x5 (7 wide, 5 high), `MatesState` / `MatesView` / `MateEvent`), `board.ts` (find matches, swap, drop and refill, pure), `monsters.ts` (data catalogue: `MONSTERS`, `STAGE_SPECS`), `game.ts` (`GameDefinition`), `game.test.ts`.
- **Phases:** `pick` then `play` then `over`. **Draft** (turn based, every pet a different element): the first drafter (`draftFirst`, random) takes 1 pet, the second takes 2, the first takes the last one (`draftTurn`, `DRAFT_ORDER`). Then both name an arena (a stage or `random`) and **confirm** at the same time (one shared clock via `keepsClock`; the opponent's arena choice stays hidden). When both have confirmed a **coin** (`COIN_MS`, `Coin.tsx`) is flipped: the winner's arena is used (`random` = the dice pick one), the winner **plays second** and starts with +5 HP (60 / 65). `settleMs` / `clockBonusMs` cover the coin.
- **Turn:** 2 moves: `swap {a,b}` (any two neighbouring, unfrozen tiles; **a swap that matches nothing keeps the tiles swapped and only costs that one move**, `MateEvent.noMatch`), `evolve {slot}` (4 berries, forest stage 3; one move) and `boost {slot}` (evolved monster, 4 berries, +4 mana; in Forest Valley 3 berries and +3 mana (`boostMana`); one move). Every match of 4+ (a straight line, or lines that cross such as an L or T, `Matches.biggest`) gives an extra move, a 5+ line also heals 5 (`COMBO_HEAL`, `MateEvent.heal`) and a 6+ line deals 5 (there is no "match bonus" option: this is always on). Only lines from your own swap count: tiles an attack clears (a column, a 2x2 block, any future special) and the cascades after an attack never give an extra move or a heal (`Ctx.attacked`).
- **Berries** are capped at what an evolve costs (`maxBerries(stage)`: 4, Forest Valley 3, shown n/4 or n/3); a boost costs the same as an evolve. Mana to fire: fire 8, water / earth / psychic 6, electric 4. There are no Evolve / Boost buttons on the screen: tap one of your pets for its pop-up (both forms, all data, and the Evolve / Boost button, greyed out until the berries are there).
- **Hit points:** option `hp` (100 default, 125 / 150 / 200: `HP_CHOICES`, picked by the host in the lobby `LobbyOptions`); the coin winner gets +5.
- **Mana** only goes to the mover's own monsters of that element; a full bar fires the special at once (numbers in `monsters.ts`, damage normal / evolved): earth 10/15 and heals the same; fire 20/25 and a random column (evolved 2 columns) counts as matched; water 10/20 and 3 random tiles turn to water; electric 5/10 and a random 2x2 (evolved 3x2) block counts as matched; psychic 10/15 and drains 2 (evolved 3) mana from every monster of the opponent. Cleared columns / blocks are a step with `ability: true`, so they pay mana / berries and cascade.
- **Stages:** stadium, forest (cheaper evolve), lava (each matched fire tile hurts), frost (other tiles of the matched kinds freeze, max 2 kinds, thaw after the next move), reactor (bombs, fuse 3, tick every swap, blow a cross of radius 2, max 2), swamp (one tile is hidden behind "?" each turn; `getPlayerView` masks it), **laboratory** (`lab`: every turn a random tile gets `charged`, up to `MAX_CHARGED` 3 at once; when a charged tile is matched or cleared by an attack it takes two random tiles with it, all for the mover: they pay mana / berries like any cleared tile; `MateStep.charged` / `pulled`; the tile shows the animated crackle overlay `tiles/charged-animated.svg`, the replay says "Charged! +2 tiles"). Every arena has its own art (portrait + landscape, made with the pogo-pixel-art skill): stadium, forest valley, lava caverns, frost lake, **reactor** (steel plates, hazard stripes, a glowing core), **swamp** (moon, cypress trees, lily pads, mud, fireflies), **laboratory** (tiled lab with a Tesla coil, monitors, beakers).
- `MateEvent` (`lastEvent`) carries `swapped`, `noMatch`, `heal`, `extraMove`, every cascade `steps` (cleared squares + the board after the fall) and `fires`, so clients replay a move; `settleMs` = swap + steps (a step that only turns tiles blue takes `CHANGE_MS`) + fires time (computers wait for it).
- **Computer:** `autoMove` tries every legal swap / evolve / boost on a copy (seeded Rng) and keeps the best by `evaluate`; also picks monsters and stage.

## UI (`apps/web/src/games/matchmates`)

`MatchMatesGame` (HP / berries, arena with the monsters on the two pads, mana bars, moves, evolve / boost buttons, 7x5 (7 wide, 5 high) board with tap-tap or slide; replays `lastEvent` unless reduced motion), `Pick` (draft + arena + Confirm), `Coin`, `LobbyOptions` (starting HP), `MatchMatesRules`, `art.ts`. The logo `assets/sprites/brand/logos/match-mates.svg` is the artist's (delivered as `pet-match.svg`).

## Art

`apps/web/src/assets/sprites/matchmates/{tiles,monsters,arenas}` from the artist's `monster_match_svg.zip` (tiles 18x18, monsters 26x27 base / 32x33 evolved, facing right: the opponent is mirrored; arenas 160x90 with pads player (44,76), opponent (116,58)). Only the five monsters with art exist; add more by data (`MONSTERS`) plus art.

## Errors

Area `MATE` in `errors.ts`.

## Animation and sound

Cleared tiles pop, the rest fall into the holes with a small bounce (`dropsFor`, `mates-fall`), new tiles come from above. Every chain link plays a higher, longer casino-style run (`chainSound` in `lib/sound.ts`), shows "CHAIN xN!", sparks / coins fly, and the board shakes from x3. Reduced motion skips the replay.

## Event animation (web)

- Swapping: the two tiles slide to each other's place (`mates-slide`, CSS vars `--sx/--sy`).
- Like Yatzy's dice: cleared tiles of a mover's element fly to that monster's mana bar (berries to the berry counter), staggered, and a white running total `+n` pops where they land (`flights`, `tallies`, tick sounds); the flown squares do not pop on the board.
- Texts (`mates-note` on the board): attack effects (`MONSTERS[e].effect`), "Match of N: +5 HP!", "Extra move!", "<pet> is evolving..." / "<evolved name>!". Floating numbers: -damage, green +heal, -N mana.
- Evolve (`EVOLVE_MS`): the old form charges (glow, shake, rising notes), flashes white, the new form pops out with sparks. `settleMs` includes `EVOLVE_MS` and `NOTE_MS` so computers wait.

## Champion select and pet info

- The draft is a **6 x 4 roster grid** (`mates-roster`): the pets in the game are tiles (`mates-pick-<element>`), the rest are dark silhouettes with a ? (`mates-soon-<n>`, coming soon, not selectable). Selecting a pet shows it larger (base and evolved) with its names, mana cost, special and damage in `mates-pet-detail`, and the button underneath (`mates-draft-confirm`) picks it. Choosing an arena scrolls smoothly down to Confirm.
- Tapping a pet at any time (the draft slots, the arena pets in the game) opens the Karma-style `.info-bubble` with its info (`PetInfo.tsx`, `usePetInfo`, `mates-pet-info`); tap again or elsewhere to close.

## Battle screen and attack animation

- The play screen is the artist's portrait layout, **140 x 258 art pixels** scaled to the width (`SCREEN` in `art.ts`; every part is placed in art pixels as a % of the stage, text uses `cqw` units): portrait arena (`assets/sprites/matchmates/arenas-portrait`), HUD (`hud/`: back and menu buttons, berry, heart, element badges and charge bars), pets on the four slots (mine left, the opponent's right, back row y 98, front row y 154), the see-through board panel (`board/`) with the 7x5 tiles on the art grid (first cell 7,170, 18 px). The game has `ownHeader` (back button = leave, menu = settings, chat button under the screen). Generated with the skill's `pm_screen.py` (arenas, HUD, board, glow); the sprites in `attack/` come from the artist (`attack/README.md` has the sprite list and the original timeline, `attack-demo-template.html` the reference).
- Match glow: `glow/<element|gold>/burst-00..07` plays round the cleared tiles of each cascade step.
- Special attack (`Attack.tsx`, `FIRE_MS` 3700: a 350 ms pause, the spirit flies at the opponent's hit points, a red number pops up there (Yatzy style: it grows, tips over, falls into the total), only then the total counts down (~800 ms after the hit), then the pet's special ability is said and shown (heal, drain) and the board changes): the element's spirit flies a bezier arc to the matched tiles (400 ms), circles them once (to 1100 ms) leaving a trail of its own past positions (every 25 ms, smaller with age), shoots at the target pet (to 1400 ms), the impact bursts, the target shakes and flashes (`mates-hit`) and the damage number floats up in the artist's red digits (`Digits`, green for healing). Reduced motion skips all of it.

## Berry shine, backdrop, pet pop-up

- Berries on the board wear `tiles/berry-shine-animated.svg` (a diagonal glint sweep and a little sparkle every 2 s; frames `berry-shine-01..11`, `berry-shine.json`), made with the pogo-pixel-art skill (`pixel.py`: overlay computed from the berry's own pixels, flat colours only).
- The arena covers the whole screen: a fixed backdrop painted with the average colour of the arena's top and bottom row (`arenaEdgeColors`) sits behind the 140 x 258 art, which keeps its whole-number scale.
- Tap one of your pets (`petInfo` in `PetInfo.tsx`): a pop-up with the Base / Evolved tabs, all numbers and the Evolve (evolved: Boost) button as a berry loading bar, greyed out until you have the berries and it is your turn.

- **The board is never reshuffled.** It used to get a brand-new board when no swap could make a match; since any swap is allowed (a swap that matches nothing just costs a move) that is not needed, and it was the "the whole board suddenly changes" bug. `createBoard` is only used for the very first board.

## Screen fit, turn display

- The arena picture is stretched over the whole play area (`objectFit: fill`, the screen is nearly the art's aspect) and everything is placed in art pixels as % of that area; the board keeps square tiles through its aspect ratio. The top bar is the standard one with the game's **logo** in place of the name (`TopBar` `logo`, from `GameUi.logo`; all games use it except Yatzy's own header).
- "Whose turn" is under the player's picture at the top (the name, then `mates-turn` "Your turn" / "Turn" and the move diamonds `mates-moves`); the draft box is orange for the player on turn; in the game the avatar has the usual yellow border only on its turn (no border otherwise). The bottom row is gone.
- **The turn only changes on screen when the field is stable**: while a move replays (`replaying`, from the arrival of the move to the end of its animation) the screen keeps showing the mover's turn (no dimming, no diamonds, no "Your turn!" banner) and the board cannot be touched; hit points and mana bars also follow the animation.

- A move that has just arrived counts as `replaying` from that very render (`seen` is compared in render, the layout effect then sets the state), so "Your turn", the move diamonds and the "Your turn!" banner never show for a turn before the chain reactions of the move before it have all played.
- Events carry what the replay needs without guessing: `MateStep.kinds` (what each cleared square was, also for Swamp tiles the board shows as "?"), `MateEvent.before` (the board before an evolve / boost, which have no swap).

- **Mana** is capped at the pet's cost: tiles beyond a full bar do not carry over. The attack empties the bar to 0 (no carry-over either); tiles that match or fall after it, from the attack itself and its cascade, fill it again (`clearMatches`, `fireReady`). A boost is capped too. The screen mirrors it (`manaShown`).
- When a player's berries are full (`maxBerries`, mine or the opponent's) pixel sparkles in their colour rise round that player's pets (`mates-ready-glow`, sprites `matchmates/fx/ready-<element>-animated.svg` made with the pogo-pixel-art skill, motion in code with `steps()` so it stays pixelated): you can evolve / boost. The `+n` total over a bar shows at once when the tiles start to fly and goes after 1 s. On a hit the red damage number sits under the hit points (kept inside the screen) and rises into the total; while the total counts down it is red, bold and bigger.
- The computer, with no matching swap on the board (the board is never reshuffled), sets something up with a random swap instead of repeating the same two tiles (that was an endless game).
- **Healing is the reverse of damage**: a green `+n` (the artist's green digits) comes out under the hit points, the total counts up in green (red for damage), bold and bigger while it counts (`hpCounting.tone`). Used by Earth's heal and the 5+ combo heal.

- **Results** (`Results.tsx`, via `GameUi.scoreText` / `resultsHeader` / `resultsRowExtra`): the standings show the hit points left ("45 HP", "0 HP") instead of 1 / 2, the arena that was played on top and each player's pets (in the form they ended in) under their row.
- **Bomb explosions** (Reactor): every tile a bomb blows up gets Sea Battle's big explosion (`assets/sprites/battle/fx/explosion-*`, `Blast.tsx`, 40 ms per frame), starting at the bomb and rippling out 45 ms per tile of distance, with a boom.

- **HUD**: each half of the screen holds the player's name centred at 25 % / 75 % of the width (at most the half's width; a long name wraps to a second line and pushes the rest down), then berries / hit points and a **box round the picture and the move diamonds** (`mates-box-<me|opp>`, `data-turn`; yellow border on the player's turn). The diamonds are 2x the old size and sit under the picture inside the box; the move is spent after the swap, an extra move adds a diamond that rises from the bottom with a green +1 (`movesShown`, `bonus`).
- **Texts sit where the action is** (`Note.x/y` in % of the board): "CHAIN xN!" on the cleared tiles, "Charged!" on the pulled tiles, "BOOM!" on the bomb, an attack's effect over the attacking pet, "<pet> is evolving..." over the pet, the heal under the hit points, so they no longer pile up in the middle.
- **Game over**: the whole board falls away (`mates-drop-away`: a small lift and counter-tilt, then each cell tips its own way and drops, a row every 150 ms from the bottom row, with a whoosh per row); the standings wait for it (`END_DROP_MS`).

- **Intro**: the coin flip comes first and its screen is opaque (`screen-bg`), so the arena is not visible before it. When it ends (`COIN_MS`) the arena fades in and for `INTRO_MS` (2.7 s, part of the first turn's `clockBonusMs` / `settleMs`) the four pets spawn one by one (`mates-spawn`: a flash and a bounce, a chime each), the hit points count up from 0 in green, and the tiles drop in row by row from the bottom row. The board cannot be touched until it is over.
- **HUD box**: one box per player holds the berries, the hit points, the picture and the moves left as **bones** at 45 degrees (`hud/bone-full.svg` / `bone-empty.svg`, made with the pogo-pixel-art skill; one bone per move, a new one rises from the bottom with a +1 for an extra move). On the player's turn the whole box is yellow (the numbers turn dark).

- **Text placement (`FitText`, `fitText.ts`)**: nothing the game says ("Puddlo is evolving...", "3 tiles to water!", "CHAIN x4!", "BOOM!") is put on the screen without going through `FitText`: it is drawn at its spot, measured against the game's screen (`stageRef`) and moved back inside (`fitInto`, pure and unit-tested in `fitText.test.ts`), or wrapped when it is wider than the screen. The animation sits on an inner element so it never fights the placement. New texts use `FitText` too.

- **Water's special on the board**: the tiles it turns blue flicker current -> blue -> current -> blue (250 ms apart, a water glow burst and a tick on each switch) and stay blue; that step takes `CHANGE_MS` (1.1 s, in `settleMs` too).
