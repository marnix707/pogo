# Pogo board token (top-down frog)

This replaces the pawn on the city board. Everything is 19×19 art px, at the same scale as the board. The anchor is the **centre** of the canvas: put it on the tile centre (tile x+16, y+16).

- `green/<up|right|down|left>/`: the frames `sit`, `blink`, `crouch` and `leap` for each direction.
  - Facing: **up** on the left column, **right** along the top, **down** on the right column and **left** along the bottom. When moving from space A to B, face the way B lies from A.
- `shadow-big.svg` and `shadow-small.svg`: navy at 35% opacity, drawn on the ground 3 px below the frog's centre. Use the small one while he's at least 4 px in the air.
- `frog-token.json`: all timings and positions.
- `hop-demo.html`: a working reference. Open it in a browser and copy its logic (render loop, hop, direction, blink).

## Hop (one tile, 330 ms)
1. `crouch`, 70 ms, on the start tile.
2. `leap`, 160 ms. Move evenly to the next tile centre while lifting him by `[0,2,5,7,7,5,2,0]` px over the leap. Draw the frog that many px higher; the shadow stays on the ground.
3. `crouch`, 60 ms, on the new tile (landing).
4. `sit`, 40 ms. For a dice roll of N, repeat N times with 30 ms between hops.

## Idle
Show `sit`. Every 2 to 4 s (random), show `blink` for 120 ms.

## Several players on one tile
Offsets from the tile centre for players 1 to 6: (-7,-6) (7,-6) (-7,6) (7,6) (0,0) (0,-9).

## 6 players
Only green (Pogo) is final. The preview `six-player-colours.png` shows the planned yellow, blue, red, purple and orange versions.
