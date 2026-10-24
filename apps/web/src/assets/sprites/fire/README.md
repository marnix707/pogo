# POGO lo-fi fire

A softer, lo-fi pixel fire: rounded, blobby flames in muted tones, from a cream core through peach and burnt orange to brick red and dark maroon edges, with ragged edges and small specks breaking off. There's no outline, the background is transparent, and the **bottom is flat**. Both versions loop seamlessly (the flicker rises up through the flame).

Palette: `#f2dfc0` core, `#efb16a`, `#e07d3e`, `#b9472f`, `#8c2d27` edge.

## Files
| Files | What | Size (art px) |
|---|---|---|
| `fire-lofi-flame-00.svg` … `07.svg` | single flame, with small side tongues | 18×24 |
| `fire-lofi-strip-00.svg` … `07.svg` | long, low strip of fire that **tiles seamlessly left-to-right** | 32×14 |
| `fire-lofi.json` | frame lists, sizes, timing | |

## Animate
- 8 frames, 100 ms per frame, loop.
- The bottom edge of every frame is the flat base; anchor it there.
- Scale by a whole number (4×: flame 72×96, strip 128×56) with `image-rendering: pixelated;`.

## Longer fire / around a card
Repeat strip tiles side by side, using the same frame on every tile, for any length. Around a card (45×61 art px), run a strip along each edge with its flat base on the edge, pointing outward: top upright, right rotated 90°, bottom 180°, left 270°. Use a different frame offset on each side (for example +0, +5, +3, +2) and draw the card on top.
