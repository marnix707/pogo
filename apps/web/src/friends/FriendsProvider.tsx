import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  DirectMessageView,
  FriendsOverview,
  GameInviteView,
  PersonView,
  PublicUser,
  RoomView,
} from '@pogo/shared';
import { Button } from '../components/ui';
import { Avatar } from '../components/ui';
import { PlayerName } from '../components/PlayerName';
import { useToast } from '../components/Toast';
import { friendsApi } from '../lib/friendsApi';
import { play } from '../lib/sound';
import { haptic } from '../lib/haptics';
import { FriendsSheet } from './FriendsSheet';
import { ProfileCard } from './ProfileCard';
import { Thread } from './Thread';

interface FriendsContext {
  /** Registered players can use friends; guests get a nudge. */
  enabled: boolean;
  /** Unread messages plus open requests (the badge on the friends button). */
  badge: number;
  openFriends: () => void;
  /** Open somebody's profile card (tap a player anywhere). */
  openProfile: (userId: string) => void;
}

const Ctx = createContext<FriendsContext>({
  enabled: false,
  badge: 0,
  openFriends: () => {},
  openProfile: () => {},
});
export const useFriends = () => useContext(Ctx);

const BANNER_MS = 4500;

/**
 * Owns everything about friends for the signed-in app: the list (refetched when the server says it changed),
 * the sheets (friends, profile card, message thread) and the banners for new messages and game invites,
 * so every screen only needs a button that calls `openFriends()` (or `openProfile(id)` on a tapped player).
 */
export function FriendsProvider({
  token,
  me,
  room,
  socialTick,
  onDm,
  onInvite,
  joinRoom,
  children,
}: {
  token: string;
  me: PublicUser;
  room: RoomView | null;
  socialTick: number;
  onDm: (fn: (m: DirectMessageView) => void) => () => void;
  onInvite: (fn: (i: GameInviteView) => void) => () => void;
  joinRoom: (code: string) => Promise<{ ok: boolean }>;
  children: ReactNode;
}) {
  const toast = useToast();
  const enabled = !me.isGuest;
  const api = useMemo(() => friendsApi(token), [token]);
  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [thread, setThread] = useState<PersonView | null>(null);
  const threadRef = useRef<string | null>(null);
  threadRef.current = thread?.id ?? null;
  const [banner, setBanner] = useState<
    | { kind: 'dm'; key: string; from: PersonView; text: string }
    | { kind: 'invite'; key: string; invite: GameInviteView }
    | null
  >(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(() => {
    if (!enabled) return;
    api
      .overview()
      .then(setOverview)
      .catch(() => {});
  }, [api, enabled]);
  useEffect(refresh, [refresh, socialTick]);

  const show = useCallback((b: NonNullable<typeof banner>) => {
    clearTimeout(bannerTimer.current);
    setBanner(b);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  // A message from a friend: a banner unless I am reading that thread or I muted them (the server does not
  // push muted senders at all); the counts come from the server again.
  useEffect(
    () =>
      onDm((m) => {
        if (m.fromId === me.id) return;
        refresh();
        if (threadRef.current === m.fromId) return;
        const from = overview?.friends.find((f) => f.id === m.fromId);
        if (!from) return;
        play('tap');
        haptic('tap');
        show({ kind: 'dm', key: m.id, from, text: m.text });
      }),
    [onDm, me.id, refresh, overview, show],
  );
  useEffect(
    () =>
      onInvite((invite) => {
        play('turn');
        haptic('tap');
        show({ kind: 'invite', key: `${invite.roomCode}${Date.now()}`, invite });
      }),
    [onInvite, show],
  );

  // A personal invite link (/?friend=CODE) sends a request once I am signed in with an account.
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('friend');
    if (!code) return;
    url.searchParams.delete('friend');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    api
      .requestFriend({ code })
      .then((r) =>
        toast.show(r.state === 'friends' ? 'You are friends now!' : 'Friend request sent', 'info'),
      )
      .catch((e: Error) => toast.show(e.message, 'error'));
  }, [api, enabled, toast]);

  const badge =
    (overview?.friends.reduce((n, f) => n + f.unread, 0) ?? 0) + (overview?.incoming.length ?? 0);
  const ctx = useMemo<FriendsContext>(
    () => ({
      enabled,
      badge,
      openFriends: () => setFriendsOpen(true),
      openProfile: (id) => setProfileId(id),
    }),
    [enabled, badge],
  );
  const inLobby = room?.status === 'lobby' ? room.code : null;

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <FriendsSheet
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        enabled={enabled}
        overview={overview}
        api={api}
        refresh={refresh}
        inLobbyCode={inLobby}
        openProfile={setProfileId}
        openThread={(p) => {
          setFriendsOpen(false);
          setThread(p);
        }}
      />
      <ProfileCard
        id={profileId}
        me={me.id}
        api={api}
        refresh={refresh}
        inLobbyCode={inLobby}
        onClose={() => setProfileId(null)}
        openThread={(p) => {
          setProfileId(null);
          setThread(p);
        }}
      />
      <Thread
        person={thread}
        me={me.id}
        api={api}
        onDm={onDm}
        refresh={refresh}
        onClose={() => setThread(null)}
      />
      {banner && (
        <div
          key={banner.key}
          role="status"
          data-testid={banner.kind === 'dm' ? 'dm-banner' : 'invite-banner'}
          className="chat-banner fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-md items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        >
          <div className="hud flex w-full items-center gap-3 px-3 py-2">
            <Avatar
              avatar={(banner.kind === 'dm' ? banner.from : banner.invite.from).avatar}
              size="md"
            />
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                if (banner.kind === 'dm') setThread(banner.from);
                setBanner(null);
              }}
            >
              <span className="block truncate text-sm font-bold">
                <PlayerName name={(banner.kind === 'dm' ? banner.from : banner.invite.from).name} />
              </span>
              <span className="block truncate text-xs text-muted">
                {banner.kind === 'dm' ? banner.text : 'invites you to a game'}
              </span>
            </button>
            {banner.kind === 'invite' && (
              <Button
                variant="gold"
                className="min-h-9 !px-3"
                data-testid="invite-join"
                onClick={() => {
                  const code = banner.invite.roomCode;
                  setBanner(null);
                  void joinRoom(code);
                }}
              >
                Join
              </Button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
