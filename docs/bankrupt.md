# Bankrupt! (id `bankrupt`)

A Monopoly-style property game for 2-6 players (`MAX_PLAYERS` in `packages/shared/src/games/bankrupt/types.ts`; 8 is a one-line change). Logic in `packages/shared/src/games/bankrupt`, UI in `apps/web/src/games/bankrupt`, art in `apps/web/src/assets/sprites/bankrupt` (made by `.claude/skills/pogo-pixel-art/examples/bk_art.py`).

## Rules

- Everyone starts with $1000, **+$50 per seat in turn order** (the later you play, the more you start with); the seat order is random.
- Roll **one die** and walk the ring. **A six rolls again**, with no penalty however often it comes. Passing or landing on Start pays the **salary** ($200). Your turn **ends by itself** once the landing is dealt with (there is no End turn button): build and sell _before_ you roll. Only the Auction corner waits for you (auction a space, or Skip).
- A free space: **buy** it, or **cancel**: it goes to **auction** (everybody bids, the mover too) unless the host switched **Auction unbought spaces** off in the lobby (`auctionOnDecline`, default on), then it simply stays free. A space somebody owns: pay **rent**. A whole **colour set** doubles the base rent and lets the owner build up to 3 buildings (house, shop, hotel) per space; rent then follows the space's table. The four **special spaces** (Harbor, Railway, Airport, Electricity) cannot be built on: their rent depends on how many of the four the owner has: **1 = $35, 2 = $70, 3 = $100, 4 = $140** each.
- **Jail**: pay $150 or wait 3 turns (the `wait` move; the mover rolls again when the time is up). You reach it with a luck card; the Jail corner itself is only a visit.
- **Luck** (`?`): a random card from the board's deck (cash, collect from / pay every player, move to a space, a bill per building, go to jail).
- **Auction corner**: land there and you may auction one of your own spaces (without buildings). The seller can **cancel** the auction; the highest bidder pays the seller.
- **Trading is auctioning**: there is no trade screen. A player who sells one of their spaces to another player in an auction (`startAuction` on the Auction corner) gets $100 and so does the buyer (`auctionBonus` in the board config; a sale by the bank pays no bonus).
- **Money**: cash may go negative, **below -$500 a player is bankrupt**: out of the game, their spaces go back to the bank. The UI warns below $0. Selling a space gives its **sell price (80 % of the price, rounded to 5)** plus half the cost of every building on it; a building sells for half its cost.
- **Net worth** (the green number) = cash + sell price of every space + half the cost of every building. Host options (lobby): net worth to win **3k / 5k / 7k / 10k / none**, rounds **20 / 30 / 45 / no limit**, auction unbought spaces **on / off**. The game ends when somebody reaches the target (richest one wins), when a round limit is passed (richest wins) or when one player is left. Standings: the winner, then by net worth, bankrupt players last (the later out the better).

## The board is data (`board.default.json`)

`config.ts` (`boardConfigSchema`, Zod) validates it; `DEFAULT_BOARD` is what the game uses (the board is copied into the state). Edit the JSON to add or remove spaces or colours. Rules the schema enforces: the first space is `start`, there is a `jail`, ids are unique, the number of spaces is a **multiple of 4** (a square ring: Start bottom-left, the ring runs up the left side and clockwise, so index N/4 is the top-left corner, N/2 top-right, 3N/4 bottom-right; `gridPos` in `apps/web/src/games/bankrupt/grid.ts`).

Tile kinds: `start`, `jail`, `auction`, `card`, `property` (`color`, `group`, `price`, `sell`, `rent[4]` = base / 1 / 2 / 3 buildings, `buildCost`), `transport` (the special spaces: `rent[]` by how many of them the owner has, no buildings). Money rules (`salary`, `jailFee`, `jailTurns`, `bankruptBelow`, `startCash`, `startCashStep`, `auctionBonus`) and the card deck sit next to the tiles.

The prices were read off the screenshots of the game this one is modelled on: Rio $100 (rent 10, buildings 30 / 90 / 160, build 50), Moscow $200 (30, 80 / 190 / 570, 120), Beijing $300 (40, 150 / 300 / 750, 170), Tokyo $420 (70, 200 / 500 / 900, 200), sell price 80 %. The other spaces were interpolated on price through those four points and written out as numbers. The prices of Railway and Electricity ($150) and the cards are our own guesses.

## State and moves

`BankruptState` is public (view = state): players (`cash`, `pos`, `jail`, `bankrupt`, `outAt`), `owned[tileId] = {owner, level}`, `phase` (`roll`, `buy`, `after`, `auction`, `over`), `turn` / `round`, `sixes`, `dice` (one die), `auction`, `events` (what the last move did, the screen replays it) and `seq`. Moves: `roll`, `buy`, `decline`, `endTurn`, `payJail`, `wait`, `build`, `sellBuilding`, `sellProperty`, `startAuction`, `bid`, `passBid`, `cancelAuction` (`endTurn` only to skip the Auction corner). `getCurrentPlayers`: the mover, or every bidder who is not the highest. Computers (`autoMove`) buy when $150 stays in the bank, build on full sets with a $300 cushion, bid up to the value, pay jail when rich and sell when deep in debt. Errors are `BANK-1xx` (`errors.ts`).

## Screen (`BankruptGame.tsx`)

Normal `GameScreen` top bar (back, rules, chat, settings). Under it: the goal line ("$3,000 net worth to win · round 1/20"), the player tags (token, avatar, name, cash and the green net worth; tap for the tooltip bubble; a red cash number below 0), the board (`Board.tsx`, `data-testid` `bk-board`, spaces `bk-tile-<id>`, tokens `bk-token-<playerId>`, the owner's colour along the bottom of a space, buildings on the right), the big die (it tumbles while it rolls) and a line about the last move in the middle, then the action area (`bk-roll`, `bk-pay-jail`, `bk-wait-jail`, `bk-end` = Skip on the Auction corner, auction `bk-bid-1|2|5` / `bk-pass` / `bk-cancel-auction`). Tapping a space opens `TileSheet` (price / rent / sell price / building rows like the original; the owner can build, sell a building or the space, or auction it on the Auction corner). Tokens walk one space per `STEP_MS` after the dice have rolled (`ROLL_MS`); computers wait for it (`settleMs`). **Buy overlay** (`BuyOverlay.tsx`, `bk-buy-overlay`): when your token has stopped on a free space a card pops up with the space, its price / rent / sell price and building rents, and **Buy** (`bk-buy`) or **Cancel** (`bk-decline`). **Money animation** (`useCashFx.ts`): every payment (rent, Start salary, a purchase, an auction sale) plays after the walk: the amount pops on the space, the payer's cash counts down, banknotes (`sprites/bankrupt/cash.svg`) fly to the receiver and the receiver's cash counts up (the green net worth follows); reduced motion skips it. The tokens glide and hop from space to space (`bk-hop`).
Lobby options: `LobbyOptions.tsx` (`bk-target-<n>`, `bk-turns-<n>`). Rules sheet: `BankruptRules.tsx`.

## Tests

`packages/shared/src/games/bankrupt/game.test.ts` (rules, prices, jail, auctions (with the bonus and the setting), bankruptcy, both win conditions, bot self-play), `e2e/tests/bankrupt.spec.ts` (a game against the computer on a phone viewport).
