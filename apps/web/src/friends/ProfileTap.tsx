import type { ReactNode } from 'react';
import { useFriends } from './FriendsProvider';

/** Makes whatever is inside (a player's picture) open that player's profile card; plain content for guests and computers. */
export function ProfileTap({
  id,
  me,
  className = '',
  children,
}: {
  id: string;
  me?: string;
  className?: string;
  children: ReactNode;
}) {
  const { enabled, openProfile } = useFriends();
  if (!enabled || id.startsWith('bot:') || id === me) return <>{children}</>;
  return (
    <button
      type="button"
      data-testid={`profile-tap-${id}`}
      aria-label="Open profile"
      onClick={() => openProfile(id)}
      className={`shrink-0 ${className}`}
    >
      {children}
    </button>
  );
}
