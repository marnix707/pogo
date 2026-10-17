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
  visibility: visibilitySchema.default('private'),
  maxPlayers: maxPlayersSchema.optional(),
  /** Validated by the chosen game's optionsSchema on the server. */
  options: z.unknown().optional(),
  /** Seconds per turn action; 0 disables the timer. */
  turnTimeSec: turnTimeSchema.optional(),
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
});
export type RoomSettingsInput = z.input<typeof roomSettingsSchema>;

export const gameMoveEnvelopeSchema = z.object({ move: z.unknown() });
export type GameMoveInput = z.input<typeof gameMoveEnvelopeSchema>;

export const emptyPayloadSchema = z.object({}).passthrough();
export type EmptyPayload = Record<string, never>;
