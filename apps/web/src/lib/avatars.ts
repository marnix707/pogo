export const AVATAR_EMOJI: Record<string, string> = {
  fox: '🦊',
  cat: '🐱',
  panda: '🐼',
  frog: '🐸',
  owl: '🦉',
  octopus: '🐙',
  robot: '🤖',
  unicorn: '🦄',
  penguin: '🐧',
  lion: '🦁',
  koala: '🐨',
  bee: '🐝',
};

export const avatarEmoji = (avatar: string) => AVATAR_EMOJI[avatar] ?? '🙂';
