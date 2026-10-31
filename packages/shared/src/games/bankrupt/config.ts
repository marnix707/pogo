import { z } from 'zod';
import defaultBoardJson from './board.default.json';

/**
 * The board as data: every space, its colour, prices and rents, the card deck and the money rules.
 * `board.default.json` is the board the game ships with; any board that passes `boardConfigSchema`
 * can replace it (add / remove spaces and colours by editing the JSON).
 */
const tileId = z.string().min(1).max(30);
const money = z.number().int().min(0).max(100_000);

const baseTile = { id: tileId, name: z.string().min(1).max(24) };

export const tileSchema = z.discriminatedUnion('kind', [
  z.object({ ...baseTile, kind: z.literal('start') }),
  z.object({ ...baseTile, kind: z.literal('jail') }),
  z.object({ ...baseTile, kind: z.literal('auction') }),
  z.object({ ...baseTile, kind: z.literal('card') }),
  z.object({
    ...baseTile,
    kind: z.literal('property'),
    /** Hex colour of the set; spaces with the same `group` are one set. */
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    group: z.string().min(1).max(20),
    price: money,
    sell: money,
    /** Rent with no building, then with 1, 2 and 3 buildings (house, shop, hotel). */
    rent: z.tuple([money, money, money, money]),
    buildCost: money,
  }),
  z.object({
    ...baseTile,
    kind: z.literal('transport'),
    price: money,
    sell: money,
    /** Rent when the owner has 1, 2, 3 ... transport spaces. */
    rent: z.array(money).min(1).max(8),
  }),
  z.object({
    ...baseTile,
    kind: z.literal('utility'),
    price: money,
    sell: money,
    /** Rent = this x the die just rolled. */
    rent: z.tuple([money]),
  }),
]);
export type Tile = z.infer<typeof tileSchema>;
export type PropertyTile = Extract<Tile, { kind: 'property' }>;
export type OwnableTile = Extract<Tile, { kind: 'property' | 'transport' | 'utility' }>;

export const cardEffectSchema = z.discriminatedUnion('type', [
  /** Gain (positive) or lose (negative) money. */
  z.object({ type: z.literal('cash'), amount: z.number().int() }),
  /** Every other player pays you. */
  z.object({ type: z.literal('collectEach'), amount: money }),
  /** You pay every other player. */
  z.object({ type: z.literal('payEach'), amount: money }),
  /** Move forward to a space (passing Start pays the salary). */
  z.object({ type: z.literal('moveTo'), tile: tileId }),
  /** Money for every building you own (negative = a bill). */
  z.object({ type: z.literal('perBuilding'), amount: z.number().int() }),
  z.object({ type: z.literal('jail') }),
]);
export type CardEffect = z.infer<typeof cardEffectSchema>;

export const boardConfigSchema = z
  .object({
    tiles: z.array(tileSchema).min(8).max(60),
    cards: z.array(z.object({ text: z.string().min(1).max(80), effect: cardEffectSchema })).max(40),
    /** Paid when you pass or land on Start. */
    salary: money,
    jailFee: money,
    jailTurns: z.number().int().min(1).max(10),
    /** Cash below this is bankrupt (it may be negative). */
    bankruptBelow: z.number().int().max(0),
    startCash: money,
    /** Extra start cash per seat in turn order (the later you play, the more you start with). */
    startCashStep: money,
    /** Seller and winner each get this from the bank when a player sells a space to another player in an auction. */
    auctionBonus: money,
    /** The space that draws a card. */
    cardTile: tileId,
  })
  .superRefine((b, ctx) => {
    // The board is a square ring: the same number of spaces on each side.
    if (b.tiles.length % 4 !== 0)
      ctx.addIssue({ code: 'custom', message: 'The number of spaces must be a multiple of 4' });
    const ids = new Set<string>();
    for (const t of b.tiles) {
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', message: `Duplicate space ${t.id}` });
      ids.add(t.id);
    }
    const need = (kind: Tile['kind']) => {
      if (!b.tiles.some((t) => t.kind === kind))
        ctx.addIssue({ code: 'custom', message: `The board needs a ${kind} space` });
    };
    need('start');
    need('jail');
    if (b.tiles[0]?.kind !== 'start')
      ctx.addIssue({ code: 'custom', message: 'The first space must be Start' });
    for (const c of b.cards)
      if (c.effect.type === 'moveTo' && !ids.has(c.effect.tile))
        ctx.addIssue({ code: 'custom', message: `A card moves to unknown space ${c.effect.tile}` });
  });
export type BoardConfig = z.infer<typeof boardConfigSchema>;

export const DEFAULT_BOARD: BoardConfig = boardConfigSchema.parse(defaultBoardJson);

export const isOwnable = (t: Tile): t is OwnableTile =>
  t.kind === 'property' || t.kind === 'transport' || t.kind === 'utility';
