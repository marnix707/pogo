# BANKRUPT! game screen – build guide

The redesigned in-game screen. All features are the same as before; only the look changes. **Every position is in `layout.json`**. This file explains how to use it.

## 1. One pixel grid (most important)
- The screen is **290 × 432 art pixels**. Everything sits on that grid: board, cards, die, buttons and text.
- Draw it at a whole number of **device** pixels per art pixel (4 on a 3x phone, which makes it 387pt wide) with `image-rendering: pixelated`, and centre it. Fill any extra space with the background pattern.
- Never scale a single element on its own (the old huge die broke this rule). If something must be bigger, it gets its own art, like `dice/`.
- Round every position to whole art pixels.

## 2. Draw order (top to bottom of the screen)
1. **Background**: repeat `background/bg-pattern-18x18.svg` from (0,0), with a navy `#101628` status-bar strip of 14 px at the top.
2. **Top bar**: `top-bar/button-back.svg`, `logo-bankrupt.svg`, and `button-players`, `button-help`, `button-chat` and `button-settings` at the positions in `layout.top_bar`.
3. **Goal label**: a navy label (see the label rule) centred at y=42, containing "RICHEST PLAYER WINS" in green `#74cca8` and " · ROUND 80" in cream `#f7f1e4`.
4. **Top player row** (opponents, up to 3), **always centred**: x = floor((290 − (n·84 + (n−1)·3)) / 2), then +87 for each next card.
5. **Board** at (16, 98): `board_background_svg.zip`, then owned tiles and rent boxes (`city_owned_svg.zip`), then frog tokens (`frog_token_svg.zip`).
6. **Board centre**: the town hall, then **one die** (`dice/die-<n>.svg`, 29×29), then the roll message in a navy label below it. See `layout.board_centre`.
7. **Bottom player row**: **you** in the middle, with up to 2 more opponents left and right. The row is centred the same way.
8. **Roll button**: `buttons/roll-the-dice.svg`. Use `roll-the-dice-disabled.svg` when it's not your turn.

## 3. Player card
For each player, draw `players/card-<colour>.svg`, or `card-<colour>-current.svg` for the player whose turn it is. The current player also gets `players/turn-marker.svg` centred 5 px above their card.
- Avatar (22×22) at (5,4). Frog badge `players/frog-badge-<colour>.svg` at (19,17), over the avatar's corner.
- Name at (31,4) in white, cash at (31,12) in cream, net worth at (31,20) in green.
- Player colours: green, yellow, blue, red, purple, orange. Use the same colour for the card strip, the frog token and the owner's rent boxes.

## 4. Die
- One die, bigger (29×29), in its own art. Its colour shows the value: 1 white, 2 yellow, 3 blue, 4 red, 5 green, 6 purple.
- Rolling animation: swap to random faces every 60 ms for about 600 ms, then show the result and the message (for example "SCOTT ROLLED 2").

## 5. Text
**All** text uses `text/pixelText.ts` (`font5`), never a system font, so the `$`, digits and letters match the board.
- Centre with `x = boxX + Math.floor((boxW - measure(text).width) / 2)`.
- **Label rule**: a navy label is a rectangle 11 px high, fill `#101628`, corners cut by 1 px, width = text width + 10. The text sits at +5, +3. Example: `labels/label-example-40.svg`.

## 6. What changed compared with the old screen
- Everything is on one pixel size. The die is no longer blown up, and it no longer covers the roll message.
- A pixel background pattern replaces the smooth gradient with contour lines.
- Frog tokens replace the pawns. A jailed frog sits behind the bars.
- Every player gets the same card, with a colour strip and a frog badge. The current player is shown by a yellow border and arrow.
- The top player row is centred, and there's room for 6 players (3 top, 3 bottom).
- One bigger die replaces two small ones.
- The goal line and the roll message sit in navy labels.
- The buttons are pixel-style, with a disabled Roll button for when it's not your turn.

`preview/screen-mockup@3x.png` shows the target.
