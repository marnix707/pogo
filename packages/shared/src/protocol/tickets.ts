import { z } from 'zod';

/** Bug reports and feedback sent from anywhere in the app (see docs/accounts-admin.md, "Tickets"). */
export const TICKET_TYPES = ['bug', 'feedback'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * new -> triaged (an admin looked at it) -> queued (Fix with Claude) -> in_progress (Claude is on it) -> fixed
 * (a fix is pushed, waiting to be checked) -> closed. Side states: wontfix, duplicate.
 */
export const TICKET_STATUSES = [
  'new',
  'triaged',
  'queued',
  'in_progress',
  'fixed',
  'closed',
  'wontfix',
  'duplicate',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The biggest screenshot (the decoded image) a ticket may carry, in bytes. */
export const MAX_TICKET_SCREENSHOT_BYTES = 320_000;

export const ticketCreateSchema = z.object({
  type: z.enum(TICKET_TYPES),
  /** Only for bugs. */
  priority: z.enum(TICKET_PRIORITIES).optional(),
  message: z.string().trim().min(3).max(2000),
  /** A downscaled screenshot as a data URL (jpeg / png / webp). */
  screenshot: z
    .string()
    .max(Math.ceil((MAX_TICKET_SCREENSHOT_BYTES * 4) / 3) + 100)
    .optional(),
  /** Everything the web app knows about its own state (no token): see `lib/diagnostics.ts`. */
  client: z.record(z.unknown()).default({}),
});
export type TicketCreateInput = z.input<typeof ticketCreateSchema>;

export const ticketPatchSchema = z.object({
  /** An admin can turn a bug into feedback and the other way round (a bug gets the priority "medium" when it has none). */
  type: z.enum(TICKET_TYPES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  adminNote: z.string().trim().max(2000).optional(),
  /** What Claude did (a short summary, the commit). */
  claudeNote: z.string().trim().max(2000).optional(),
});
export type TicketPatchInput = z.input<typeof ticketPatchSchema>;

/** A ticket as the admin list shows it. */
export interface TicketRow {
  id: string;
  type: TicketType;
  priority: TicketPriority | null;
  status: TicketStatus;
  message: string;
  userId: string | null;
  nickname: string;
  /** The screen the player was on (home, lobby, a game ...). */
  screen: string;
  gameId: string | null;
  hasScreenshot: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A ticket with everything that was captured. */
export interface TicketDetail extends TicketRow {
  client: Record<string, unknown>;
  /** The room's authoritative state, the last moves and chat at the moment of the report (admins only). */
  server: Record<string, unknown> | null;
  adminNote: string;
  claudeNote: string;
}

/** What a player is told about the state of their ticket (the internal states are not all interesting to them). */
export const PLAYER_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Received',
  triaged: 'Seen by the team',
  queued: 'Being worked on',
  in_progress: 'Being worked on',
  fixed: 'Fixed in the next update',
  closed: 'Closed',
  wontfix: 'Will not be changed',
  duplicate: 'Already reported',
};

/** A player's own ticket: what they sent and where it stands (never the admin's notes or the captured state). */
export interface MyTicket {
  id: string;
  type: TicketType;
  status: TicketStatus;
  /** The start of what they wrote. */
  message: string;
  createdAt: number;
  updatedAt: number;
  /** The status or type changed since the player last opened their list. */
  unread: boolean;
}
