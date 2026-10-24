# POGO sea battle

A complete sea-battle asset set in the POGO pixel style. The ships have the navy outline and shading; the bomb effects (explosion, splash, burning) use the lo-fi fire style. Every file is a transparent pixel-art SVG, except the water tiles, which are the sea. **Read `battle.json`** for every file, size and timing.

## Grid
- 1 cell = **16×16 art px**; a 10×10 board = 160×160.
- Show at **2× (32px cells)** or **3× (48px cells)** with `image-rendering: pixelated;`.

## Fleet (`ships/`)
| Ship | Cells | Horizontal | Vertical |
|---|---|---|---|
| Carrier | 5 | 80×16 | 16×80 |
| Battleship | 4 | 64×16 | 16×64 |
| Cruiser | 3 | 48×16 | 16×48 |
| Submarine | 3 | 48×16 | 16×48 |
| Destroyer | 2 | 32×16 | 16×32 |

- Files: `<ship>-h.svg` (bow faces right), `<ship>-v.svg` (bow faces down), and the charred `<ship>-sunk-h.svg` / `<ship>-sunk-v.svg`.
- Place the image with its top-left on the ship's first cell.

## Board (`tiles/`)
`water-00…03.svg` and `water-grid-00…03.svg` (the grid version has a 1px dark line on its top and left edge). Waves loop over 4 frames at 400 ms and tile seamlessly. Add one dark line on the far right and bottom of the board.

## Markers (`markers/`, 16×16)
- `target-00/01.svg`: the yellow aim reticle; alternate every 300 ms for a pulse.
- `miss.svg`: cream X.
- `hit.svg`: red burst.
- `burn-00…07.svg`: a small lo-fi flame that loops at 100 ms. Put it on top of every hit cell, and keep it burning on sunk ships.

## Bomb animation (`fx/`, 32×32, centred on the target cell)
Each frame spills 8px over the neighbouring cells, so draw it above the board.
1. `bomb-00…03.svg` (90 ms): the bomb falls, shrinking toward the water.
2. **Hit:** `explosion-00…09.svg` (80 ms): a lo-fi blast that flares and breaks into smoke. Then show `hit.svg` and start the `burn` loop.
   **Miss:** `splash-00…07.svg` (80 ms): a white burst and an expanding foam ring. Then show `miss.svg`.
3. **Sunk:** when every cell of a ship is hit, swap it to its `-sunk` image and keep the burn loops on its cells.
