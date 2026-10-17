/** Computer players are ordinary seats in a game with these ids, names and avatar. */
export const BOT_AVATAR = 'robot';
export const BOT_NAMES = ['Robo', 'Bolt', 'Pixel', 'Chip', 'Zap', 'Gizmo', 'Byte', 'Nova'] as const;
export const BOT_ID_PREFIX = 'bot:';

export const botId = (index: number): string => `${BOT_ID_PREFIX}${index + 1}`;
export const isBotId = (id: string): boolean => id.startsWith(BOT_ID_PREFIX);
