import { splitDevTag } from '@pogo/shared';
import { useFriends } from '../friends/FriendsProvider';

/**
 * A player's name for display. Developers come through the server as "Name (dev)": the tag is drawn
 * as a small animated rainbow "dev" instead of plain text. With `id` the name opens that player's profile when
 * tapped (like their picture does); not for yourself, computers or guests' friends-less sessions.
 */
export function PlayerName({ name, id, me }: { name: string; id?: string; me?: string }) {
  const { enabled, openProfile } = useFriends();
  const { name: base, dev } = splitDevTag(name);
  const text = (
    <>
      {base}
      {dev && (
        <span className="dev-tag" data-testid="dev-tag" title="Developer">
          dev
        </span>
      )}
    </>
  );
  if (!id || !enabled || id.startsWith('bot:') || id === me) return text;
  return (
    <button
      type="button"
      data-testid={`name-tap-${id}`}
      aria-label={`Open profile of ${base}`}
      onClick={() => openProfile(id)}
      className="inline cursor-pointer p-0 text-left [font:inherit] [letter-spacing:inherit] [text-transform:inherit] [text-shadow:inherit] hover:underline"
    >
      {text}
    </button>
  );
}
