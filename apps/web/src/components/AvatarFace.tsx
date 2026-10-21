import { avatarEmoji } from '../lib/avatars';

/** `img:<userId>:<version>` is an uploaded picture; anything else is an emoji key. */
export function pictureUrl(avatar: string): string | null {
  const m = /^img:([\w-]+):(\d+)$/.exec(avatar);
  return m ? `/api/users/${m[1]}/avatar?v=${m[2]}` : null;
}

/** A player's face: their uploaded picture, or the emoji of the chosen icon. */
export function AvatarFace({ avatar, fill = false }: { avatar: string; fill?: boolean }) {
  const url = pictureUrl(avatar);
  if (!url) return <>{avatarEmoji(avatar)}</>;
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
