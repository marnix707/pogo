# City board game – complete asset kit (POGO pixel style)

Everything needed to build the property board game. The single source of truth is **`game.json`**: every space, price, file path and layout coordinate is in it. Read it first.

## Pixel rules (important)
- All sizes are in **art pixels**. The board is 257×257.
- Draw everything at a whole number of device pixels per art pixel, with `image-rendering: pixelated`. On a 3x phone use 4 device px per art px, which makes the board 343pt wide.
- Round every position to whole art pixels. Never smooth or rotate the art.
- Cards use the same scale as the board.

## Folders
| Folder | What |
|---|---|
| `board/board-empty.svg` | The board background: all 28 tiles plus the plain blue middle. **No building, tokens or owner frames in it.** |
| `board/centre/city-hall.svg` | The town hall (50×46). Draw it once, centred in `board.inner_area`. |
| `board/tiles/` | Each tile on its own (33×33), in case you need to highlight or animate one. Positions are in `game.json → spaces[].x/y`. |
| `board/tokens/` | Player pawns in green, yellow, blue and red. |
| `board/owner/` | Owner frames (33×33). Draw one over a tile at the tile's x/y when a player owns it. |
| `cards/cards/` | Finished property cards (152×176 plus a 3px shadow). Cities have two versions: `card-<key>.svg` (Upgrade active) and `card-<key>-no-upgrade.svg` (Upgrade greyed out). Transport and Power can never be upgraded, so their Upgrade is always greyed out. |
| `cards/parts/` | Parts to build or re-skin any card in code: base, headers, art, buttons (normal and `-disabled`), and the X close button. |
| `cards/pixel-font.json` | The exact pixel letters for any new text: `font5` normal, `font4` small, and `font5` doubled for titles and values. |
| `dice/` | The POGO dice, 1 to 6. |
| `previews/` | PNGs showing how it should look. For reference only; don't ship them. |

## Draw order on screen
1. `board/board-empty.svg`
2. `board/centre/city-hall.svg`, centred in the inner area
3. Owner frames over owned tiles
4. Tokens on their current space. If several share a space, offset them by a few px.
5. Dice, then any card pop-up on top

## Property card pop-up
Tap a city, transport or power space to show its card. `game.json → card.layout` holds every coordinate.
- **Close:** the X button at `layout.close_x` closes the card.
- **SELL** (`layout.buttons[0]`): active when the player owns the property. Otherwise use `button-sell-disabled.svg`.
- **UPGRADE** (`layout.buttons[1]`): active only when **all** of these are true. Otherwise show `button-upgrade-disabled.svg`, or the card's `-no-upgrade` version, and ignore taps.
  - the player owns the property;
  - the player owns the whole colour group (the "street");
  - the player has at least the `upgrade` price in cash;
  - the property is a city (transport and power can't be upgraded).
- **BUY:** to buy an unowned property, swap SELL for `button-buy.svg` (or `-disabled` if the player can't afford it).
- **Stats** across the top: PRICE, RENT, SELL, UPGRADE. If you build cards in code, draw the values with the doubled `font5` (navy) and the labels with `font5` (#796e9e). A "-" means it can't be upgraded.

## Numbers
Prices come from the board. **Rent (30%), sell (80%) and upgrade (50%) are placeholders**, and so are transport ($100 / $35 / $80) and power ($150 / $50 / $120). Set the real rules in `game.json`. If you change any number, either draw the stats in code from the parts or regenerate the finished cards.

## Board order
`spaces[0]` is START (bottom-left). Play goes clockwise: up the left side, along the top, down the right side and back along the bottom. There are 28 spaces in total: 4 corners (start, chance, jail and auction), 20 cities in 8 colour groups, 3 transport spaces (harbor, railway and airport) and 1 utility (power).
