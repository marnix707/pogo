import { TileButton } from '../components/TopBar';
import { FriendsIcon } from '../components/icons';
import { useFriends } from './FriendsProvider';

/** The friends tile (next to the leaderboard button on every screen); the badge counts unread messages and open requests. */
export function FriendsButton({
  small = false,
  className = '',
}: {
  small?: boolean;
  className?: string;
}) {
  const { badge, openFriends } = useFriends();
  return (
    <TileButton
      small={small}
      onClick={openFriends}
      aria-label={badge > 0 ? `Friends, ${badge} new` : 'Friends'}
      data-testid="friends-button"
      className={className}
    >
      <span className="relative">
        <FriendsIcon className="h-5 w-5" />
        {badge > 0 && (
          <span
            data-testid="friends-badge"
            className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accentink"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
    </TileButton>
  );
}
