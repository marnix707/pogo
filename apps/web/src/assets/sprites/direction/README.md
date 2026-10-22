# Rotation arrows (direction change)

A ring of four pixel-art arrows (red, yellow, blue, green) that loops around one card, shown briefly when the playing direction changes (for example after a Reverse). The background is transparent. The style matches the colour-match cards.

## Files
- `direction-cw.svg`: static ring, clockwise
- `direction-ccw.svg`: static ring, anticlockwise
- `frames/cw-00.svg` … `cw-07.svg`: 8-frame clockwise spin
- `frames/ccw-00.svg` … `ccw-07.svg`: 8-frame anticlockwise spin
- `direction.json`: size, card offset and timing

## Placement
- The ring is **77×93** art pixels. The card (45×61) sits inside it at offset **(16, 16)**.
- Scale the ring and the card by the same whole number. At 4×: ring 308×372, card 180×244 at (64, 64).
- Use `image-rendering: pixelated;` so the pixels stay sharp.

## Animation
Play the spin in the **new** direction at 60 ms per frame for 1–2 turns (8 frames = 1 turn), hold the static ring ~400 ms, then fade out over ~200 ms.
