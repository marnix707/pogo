# UNO card art (drop the SVGs here)

Until the artist's SVGs exist, `games/uno/UnoCard.tsx` draws every card as a placeholder. Any file
dropped in this folder is picked up **automatically** (no code change): name it like this and it
replaces the placeholder for that card.

| Card | File name |
| --- | --- |
| number | `red-0.svg` ... `red-9.svg`, `yellow-…`, `green-…`, `blue-…` |
| skip | `red-skip.svg`, `yellow-skip.svg`, `green-skip.svg`, `blue-skip.svg` |
| reverse | `red-reverse.svg`, … |
| draw two | `red-draw2.svg`, … |
| wild | `wild.svg` |
| wild draw four | `wild-draw4.svg` |
| back | `back.svg` |

Cards are drawn at a 5 : 7 ratio (like the Karma cards), scaled with `image-rendering: pixelated`.
