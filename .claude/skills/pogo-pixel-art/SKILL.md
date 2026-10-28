---
name: pogo-pixel-art
description: Make new pixel-art game assets (sprites, tiles, effects, animations, logos, UI) for POGO and Pet Match in the house style, exported as SVG frames plus JSON. Use whenever a new graphic or animation is needed for the app.
---

# POGO pixel art

All the art in this app is **drawn with code**: a sprite is a grid of characters, a small Python renderer shades it, outlines it and writes a crisp SVG. Follow this file and the examples, and new assets will match the existing kit.

## Workflow (always)
1. **Find a neighbour.** Look in `examples/` for the closest existing asset (a tile, pet, effect, logo) and copy its approach, sizes and palette.
2. **Draw** in Python with `scripts/pixel.py`:
   - Objects: char-grid rows → `render(rows, pal)`. This adds the navy outline and a 1px drop shadow, and shades tuple colours light (top-left) / base / dark (bottom-right).
   - Effects (glow, fire, sparks, trails, impacts): build the grid directly with maths (distance fields, angles). They have **no outline**.
3. **Look at it.** Save a preview with `png(g, 'x.png', s=6)` or `preview([...], 'sheet.png')` and **open the PNG with Read**. Check proportions, readability at 1x, and gaps or stray pixels. Fix and look again. Never deliver unseen art.
4. **Export.**
   - `write_svg(g, path, title)`: transparent background, `shape-rendering="crispEdges"`.
   - Animations: numbered frames `name-00.svg…`, plus `animated_svg(frames, path, title, ms_list)` for a self-playing preview.
5. **Describe it.** Add a JSON next to the files with sizes, anchors/offsets, ms per frame, loop or once, and z-order. The app code should never have to guess.
6. **Use it in the app.**
   - Draw at a whole-number scale (3x on phones) with `image-rendering: pixelated`.
   - Round every position to whole art pixels.
   - Never smooth or rotate sprites; use frames instead.

## House style
- **Outline / ink:** `#101628` (navy). Objects get a 1px outline plus a 1px shadow below; wordmarks get 2px.
- **App blues:** background `#274f8f`, play `#3aaef7`, install `#0061b8`. Panels `#233049` / `#1b2338` / `#334461`.
- **Yellow (brand):** `#fda200`, light `#fdcf51`, pale `#fff4b4`. Cream text `#f7f1e4`.
- **Elements** (light, base, dark):
  - fire: `#fd7957 #eb6b43 #c14139`
  - water: `#83e9f8 #3aaef7 #0061b8`
  - earth: `#74cca8 #56a786 #459373`
  - electric: `#fff1a8 #fdcf51 #ea9600`
  - psychic: `#ae65ff #935adc #7d51ae`
- **Glow colours** (core, light, base, deep): see `GLOW` in `examples/pm_screen.py`. For effects, use these and fade by stepping down the list, then dither (checkerboard) before disappearing.
- **Lo-fi fire / embers:** `#f2dfc0 #efb16a #e07d3e #b9472f #8c2d27`. No outline, soft blobs.
- **Frog greens** (Pogo): see `examples/` and the main kit; keep the teal greens.
- Use flat colours only: no gradients, no anti-aliasing, no transparency except deliberate see-through panels (`'#rrggbb@aa'` in pm_screen).
- Make **originals** only: no Pokémon, Pac-Man, UNO, Yahtzee, Battleship or other trademarked look-alikes.

## Sizes (art px)
- Phone screen: **140×304** (shown at 3x). Status bar 0–16, arena 16–274.
- Board: 7×5 cells of **18**, first cell at (7,170). Candy art about 16×17 inside the cell.
- Pets: base about 26 px, evolved about 32 px; feet slots are in `pet-match-screen.json`.
- Effect canvases: glow 32×32 (offset −7,−7 from the cell), spirit 15 / charged 21, impact 30.
- Icons: 7–11 px plus outline. Avatars: 22×22. Text: the 3×5 font in pm_screen (`FONT`); double it for damage numbers.

## Animation rules
- 4–8 frames, 40–90 ms each. Hits are fast (40–60 ms), idles slower.
- Motion lives in **code** (paths, easing, shake). Sprites only carry the look (spin, flicker, burst). See `examples/attack-demo-template.html` for:
  - the bezier fly-in and the elliptical orbit around matched tiles;
  - a stateless trail (the spirit's position 25 ms ago, 50 ms ago… drawn smaller by age);
  - hit shake and white flash, the floating damage number, and the bouncing refill.
- Name frames `thing-00.svg` and up. Give every animation a JSON entry with `ms_per_frame`, `loop` and `anchor`.
