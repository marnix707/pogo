import { z } from 'zod';

export const AVATARS = [
  'fox',
  'cat',
  'panda',
  'frog',
  'owl',
  'octopus',
  'robot',
  'unicorn',
  'penguin',
  'lion',
  'koala',
  'bee',
] as const;
export type Avatar = (typeof AVATARS)[number];

/** Strip control/format chars and angle brackets, collapse whitespace. */
export function sanitizeNickname(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{C}<>]/gu, '')
    .trim();
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

export const nicknameSchema = z
  .string()
  .max(100)
  .transform(sanitizeNickname)
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN, `Nickname must be at least ${NICKNAME_MIN} characters`)
      .max(NICKNAME_MAX, `Nickname can be at most ${NICKNAME_MAX} characters`),
  );

export const emailSchema = z
  .string()
  .max(254)
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email('Please enter a valid email address'));
export const PASSWORD_MIN = 8;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(200);
export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const registerStartSchema = z.object({ email: emailSchema });
export const registerVerifySchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const resetStartSchema = z.object({ email: emailSchema });
export const resetVerifySchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});
export const mergeSchema = z.object({ guestToken: z.string().min(10).max(2000) });
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });

export const profileSchema = z.object({
  nickname: nicknameSchema,
  avatar: z.enum(AVATARS),
});
export type ProfileInput = z.input<typeof profileSchema>;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, 'Invalid room code');

export const visibilitySchema = z.enum(['private', 'public']);
export type Visibility = z.infer<typeof visibilitySchema>;

const maxPlayersSchema = z.number().int().min(1).max(12);
const turnTimeSchema = z.number().int().min(0).max(600);

export const roomCreateSchema = z.object({
  gameId: z.string().min(1).max(32),
  visibility: visibilitySchema.default('public'),
  maxPlayers: maxPlayersSchema.optional(),
  /** Validated by the chosen game's optionsSchema on the server. */
  options: z.unknown().optional(),
  /** Seconds per turn action; 0 disables the timer. */
  turnTimeSec: turnTimeSchema.optional(),
  /** Computer players (only for games that support them). */
  bots: z.number().int().min(0).max(8).optional(),
  /** Start the game right away (used for "play the computer"). */
  autoStart: z.boolean().optional(),
});
export type RoomCreateInput = z.input<typeof roomCreateSchema>;

export const roomJoinSchema = z.object({ code: roomCodeSchema });
export type RoomJoinInput = z.input<typeof roomJoinSchema>;

export const roomKickSchema = z.object({ userId: z.string().min(1).max(64) });
export type RoomKickInput = z.input<typeof roomKickSchema>;

export const roomSettingsSchema = z.object({
  visibility: visibilitySchema.optional(),
  maxPlayers: maxPlayersSchema.optional(),
  options: z.unknown().optional(),
  turnTimeSec: turnTimeSchema.optional(),
  bots: z.number().int().min(0).max(8).optional(),
});
export type RoomSettingsInput = z.input<typeof roomSettingsSchema>;

export const gameMoveEnvelopeSchema = z.object({ move: z.unknown() });
export type GameMoveInput = z.input<typeof gameMoveEnvelopeSchema>;

export const roomQuickplaySchema = z.object({ gameId: z.string().min(1).max(32) });
export type RoomQuickplayInput = z.input<typeof roomQuickplaySchema>;

export const CHAT_MAX_LENGTH = 300;

/** Chat text: one line, no control characters, trimmed. */
export function sanitizeChatText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

export const chatSendSchema = z.object({
  text: z
    .string()
    .max(1000)
    .transform(sanitizeChatText)
    .pipe(z.string().min(1).max(CHAT_MAX_LENGTH)),
});
export type ChatSendInput = z.input<typeof chatSendSchema>;

export const emptyPayloadSchema = z.object({}).passthrough();
export type EmptyPayload = Record<string, never>;

/** `toLobby`: skip the instant restart some games do on a rematch and wait in the waiting room. */
export const rematchSchema = z.object({ toLobby: z.boolean().optional() });
export type RematchInput = z.input<typeof rematchSchema>;
