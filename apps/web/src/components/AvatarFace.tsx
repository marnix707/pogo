import { avatarEmoji } from '../lib/avatars';

/** The artist's pixel-art avatars, `avatar-<key>.svg` (the robot has none yet: it stays an emoji). */
const art = import.meta.glob('../assets/sprites/avatars/avatar-*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const artByKey: Record<string, string> = {};
for (const [path, url] of Object.entries(art)) {
  const key = /avatar-(\w+)\.svg$/.exec(path)?.[1];
  if (key) artByKey[key] = url;
}

/** `img:<userId>:<version>` is an uploaded picture; anything else is an emoji key. */
export function pictureUrl(avatar: string): string | null {
  const m = /^img:([\w-]+):(\d+)$/.exec(avatar);
  return m ? `/api/users/${m[1]}/avatar?v=${m[2]}` : null;
}

/** A player's face: their uploaded picture, or the emoji of the chosen icon. */
export function AvatarFace({ avatar, fill = false }: { avatar: string; fill?: boolean }) {
  const url = pictureUrl(avatar);
  if (!url) {
    const pixel = artByKey[avatar];
    if (!pixel) return <>{avatarEmoji(avatar)}</>;
    return (
      <img
        src={pixel}
        alt=""
        draggable={false}
        style={{ imageRendering: 'pixelated' }}
        className={
          fill ? 'h-full w-full object-contain' : 'inline-block h-[1.2em] w-[1.2em] align-middle'
        }
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className={
        fill
          ? 'h-full w-full object-cover'
          : 'inline-block h-[1.2em] w-[1.2em] rounded-[3px] object-cover align-middle'
      }
    />
  );
}
