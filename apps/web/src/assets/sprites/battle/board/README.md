# Sea battle board (animated grid)

The complete 10×10 playing board as ready-made pixel-art SVGs: water cells with gently moving waves and dark grid lines, in the same style as the sea-battle ships and markers.

| File | What | Size (art px) |
|---|---|---|
| `board-animated.svg` | the board, **animates by itself** (loops 4 wave frames) | 161×161 |
| `board-labelled-animated.svg` | the same with **A–J** across the top and **1–10** down the side, **animates by itself** | 170×170 |
| `board-00…03.svg` | the 4 frames separately (if you'd rather animate in code) | 161×161 |
| `board-labelled-00…03.svg` | the 4 labelled frames separately | 170×170 |

## Using it
- **Easiest:** `<img src="board-animated.svg" style="image-rendering: pixelated">`. It loops its waves on its own (400 ms per frame, SMIL animation, works in all modern browsers).
- One cell is **16×16 art px**. On the plain board, cell (col, row) starts at `(col × 16, row × 16)`. On the labelled board, add a **9px offset** for the labels: `(9 + col × 16, 9 + row × 16)`.
- Scale by a whole number: 2× = 322px (32px cells), 3× = 483px (48px cells). Ships, markers and bomb effects from the sea-battle set line up exactly on the cells at the same scale.
- The labels and the margin around them are transparent, so they sit on your screen background; the labels are `#b9becb`.
