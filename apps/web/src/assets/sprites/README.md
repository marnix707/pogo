# POGO: SVG asset export

Every game asset for **POGO** (Pogo the frog, logo, playing cards, dice, animations) as pixel-art SVG with a **transparent background**. The only exceptions are the app icons, where the yellow tile is part of the icon.

**Start with `manifest.json`.** It lists every SVG with its pixel size (`w`, `h`), whether it's transparent, and a one-line description.

## How the SVGs work
- Each SVG is drawn on a pixel grid: `viewBox` = art pixels, and each pixel is a `<rect>` with `shape-rendering="crispEdges"`.
- **Scale by whole numbers only** (2×, 3×, 4×…), so pixels stay sharp. A 24×20 frog at 4× is 96×80.
- If you place them with `<img>`, add `image-rendering: pixelated;`.
- Colours are in `palette.css` as CSS variables (`--pogo-yellow`, `--pogo-outline` …). The outline and shadow colour everywhere is `#101628`.

## Folders
| Folder | Contents |
|---|---|
| `brand/` | Frog, frog on pogo stick, pogo stick, wordmarks (yellow = primary), lockup, key art, **key-art-boing** (start screen with speed lines), boing-lines |
| `brand/logos/` | Game-mode logos for the game picker: `karma.svg` (Karma), `yatzy.svg` (Yatzy, the dice scoring game), `last-card.svg` (the colour-match card game) |
| `cards/` | All 52 cards `AS.svg` … `KC.svg` (rank + **S**pades/**H**earts/**D**iamonds/**C**lubs; ranks `A, 2–10, J, Q, K`), `joker.svg`, `back.svg`, and `suits/` |
| `colour-cards/` | Colour-match deck (45×61 px, same size as the playing cards): `{red,yellow,blue,green}-{0..9,skip,reverse,draw2}.svg`, `wild.svg`, `wild-draw4.svg`, `back.svg`. `deck.json` lists how many of each go in a 108-card deck |
| `characters/` | Frog king, queen, jack and joker art on their own (24×30), for menus and win screens |
| `dice/` | `die-1.svg` … `die-6.svg` (16×16). The colour = the value, and every pip (including the single pip on the 1) is the same navy 2×2 dot: 1 white, 2 yellow, 3 blue, 4 red, 5 green, 6 purple. Show a **held** die by lifting it ~12px, not by recolouring. Shadow: `filter: drop-shadow(0 4px 0 #101628)` |
| `animation/` | Front-view Pogo animation: `frames/`, `fx/`, sprite sheet, `pogo-animation.json` |
| `animation-side/` | Side-view (facing right) Pogo animation: same structure, `pogo-side-animation.json` |
| `icons/` | `icon-rounded.svg` (the rounded logo tile, for use **inside** the app, e.g. the header), `icon.svg` and `favicon.svg` (square, because the OS rounds them itself), plus the PNG icons that browsers, iOS and the PWA manifest require |

### Cards
- 45×61 art pixels. **Show them at 180×244 (4×)** or another multiple of 4. The face-card characters are drawn 1.25× bigger, so they're only pixel-perfect at multiples of 4.
- The house style puts a `0 6px 0 #101628` shadow under each card. To show a selected card, lift it and add a `#fda200` outline.

### Colour-match cards
- A 108-card deck. Per colour: one 0, two each of 1–9, and two each of Skip, Reverse and Draw two. Plus four Wild and four Wild draw four. Counts are in `colour-cards/deck.json`.
- Colours: red `#fd5f55`, yellow `#fda200`, blue `#3aaef7`, green `#56a786` (the same as the dice). Wild cards are navy with Pogo, or +4, on a four-colour tile. The back shows Pogo above the yellow POGO wordmark, so it never looks like a Wild.
- The 6 and 9 have an underline so they can be told apart when a card is upside down.
- Same display rules as the playing cards: 180×244 (4×) is ideal, and any whole multiple works because this deck has no scaled art.

### Animations
Pogo hops in, jumps onto his pogo stick, then bounces in place.
- All frames are **32×32**, anchored at their **bottom-centre**.
- In the JSON, each `sequence` is a list of steps `{frame, ms, x, y, fx}`. `x`/`y` are art pixels relative to where the stick stands (x = 0) and the ground (y = 0, negative = up). Multiply by your scale.
- Play `hop_in` → `mount` → `pogo_loop` (loops). While `show_stick` is true, also draw the stick frame at (0, 0), until the first `pogo_*` frame.
- `fx`: effect sprites to draw on top for that step (speed lines, boing bars, landing dust), at their own x/y with the same anchor.
- For the side view, put x = 0 at the screen centre. To make him face left, flip with `scaleX(-1)` and negate all x values.

```js
const anim = await (await fetch('/animation-side/pogo-side-animation.json')).json();
const intro = ['hop_in', 'mount'].flatMap(s => anim.sequences[s].steps);
const loop = anim.sequences.pogo_loop.steps;
let i = 0;
function tick() {
  const st = i < intro.length ? intro[i] : loop[(i - intro.length) % loop.length];
  const onStick = st.frame.includes('pogo_');
  draw(st.frame, st.x * SCALE, st.y * SCALE);                    // frames/NN-<frame>.svg
  if (!onStick) draw(anim.stick.frame, 0, 0);                    // stick waiting for him
  for (const fx of st.fx) draw('fx/' + fx.name, fx.x * SCALE, fx.y * SCALE);
  i++; setTimeout(tick, st.ms);
}
tick();
```

## Source data
`pogo-assets.json` holds every sprite as pixel rows plus its palette, and the pixel fonts. Use it to generate new art, recolour, or animate in code. In each row string, `.` is transparent and every other character maps to a colour through the palette.
