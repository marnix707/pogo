import { useEffect, useState } from 'react';
import type { FriendState, FriendsOverview, PersonView } from '@pogo/shared';
import { getGameUi } from '../games/registry';
import { Avatar, Button } from '../components/ui';
import { DetentSheet } from '../components/DetentSheet';
import { PlayerName } from '../components/PlayerName';
import { useToast } from '../components/Toast';
import type { FriendsApi } from '../lib/friendsApi';
import { shareRoomLink } from '../lib/shareRoom';

type Tab = 'friends' | 'requests' | 'find';

/** The friends sheet: my friends (online first), open requests, and finding people (nickname search + my invite link). */
export function FriendsSheet({
  open,
  onClose,
  enabled,
  overview,
  api,
  refresh,
  inLobbyCode,
  openProfile,
  openThread,
}: {
  open: boolean;
  onClose: () => void;
  enabled: boolean;
  overview: FriendsOverview | null;
  api: FriendsApi;
  refresh: () => void;
  /** The code of the lobby I am in (friends can be invited into it). */
  inLobbyCode: string | null;
  openProfile: (id: string) => void;
  openThread: (p: PersonView) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('friends');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<(PersonView & { state: FriendState })[]>([]);
  const fail = (e: Error) => toast.show(e.message, 'error');
  const run = (p: Promise<unknown>, ok?: string) =>
    p
      .then(() => {
        if (ok) toast.show(ok, 'info');
        refresh();
      })
      .catch(fail);

  useEffect(() => {
    if (!open || tab !== 'find' || q.trim().length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .search(q.trim())
        .then((r) => setFound(r.users))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [api, open, tab, q]);

  const link = overview ? `${window.location.origin}/?friend=${overview.code}` : '';
  const tabBtn = (id: Tab, label: string, count = 0) => (
    <button
      key={id}
      data-testid={`friends-tab-${id}`}
      aria-pressed={tab === id}
      onClick={() => setTab(id)}
      className={`label min-h-9 flex-1 rounded-md border-2 px-2 ${
        tab === id ? 'border-accent bg-accent text-accentink' : 'border-edge/50 text-ink'
      }`}
    >
      {label}
      {count > 0 && ` (${count})`}
    </button>
  );
  const row = (p: PersonView, right: React.ReactNode, sub?: React.ReactNode) => (
    <li key={p.id} className="flex items-center gap-3 py-1.5" data-testid={`friend-row-${p.id}`}>
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => openProfile(p.id)}
      >
        <Avatar avatar={p.avatar} size="md" />
        <span className="min-w-0">
          <span className="block truncate font-bold">
            <PlayerName name={p.name} />
          </span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
      </button>
      {right}
    </li>
  );

  return (
    <DetentSheet
      open={open}
      onClose={onClose}
      title="Friends"
      headerAction={
        inLobbyCode && (
          <Button
            variant="secondary"
            aria-label="Invite friends"
            data-testid="friends-share"
            className="min-h-10 !px-3"
            onClick={() =>
              void shareRoomLink(inLobbyCode).then((copied) => {
                if (copied) toast.show('Invite link copied');
              })
            }
          >
            Invite
          </Button>
        )
      }
    >
      {!enabled ? (
        <p className="py-6 text-center" data-testid="friends-guest">
          Register an account (open your profile) to add friends, message them and invite them to
          games.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            {tabBtn('friends', 'Friends', overview?.friends.length ?? 0)}
            {tabBtn('requests', 'Requests', overview?.incoming.length ?? 0)}
            {tabBtn('find', 'Find')}
          </div>

          {tab === 'friends' && (
            <ul className="divide-y divide-edge/20" data-testid="friends-list">
              {overview?.friends.length === 0 && (
                <li className="py-6 text-center text-muted">
                  No friends yet. Find people or share your link.
                </li>
              )}
              {overview?.friends.map((f) =>
                row(
                  f,
                  <span className="flex items-center gap-2 pr-2">
                    {inLobbyCode && (
                      <Button
                        variant="secondary"
                        className="min-h-9 !px-2.5 text-xs"
                        data-testid={`friend-invite-${f.id}`}
                        onClick={() => void run(api.invite(f.id, inLobbyCode), 'Invite sent')}
                      >
                        Invite
                      </Button>
                    )}
                    <Button
                      className="relative min-h-9 !px-2.5 text-xs"
                      data-testid={`friend-message-${f.id}`}
                      onClick={() => openThread(f)}
                    >
                      Chat
                      {f.unread > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white">
                          {f.unread}
                        </span>
                      )}
                    </Button>
                  </span>,
                  <>
                    <span className={f.online ? 'text-[#14673a]' : ''}>
                      {f.online ? '● online' : '○ offline'}
                    </span>
                    {f.room &&
                      ` · ${getGameUi(f.room.gameId)?.name ?? f.room.gameId} ${f.room.status === 'lobby' ? 'lobby' : 'game'}`}
                    {f.muted && ' · muted'}
                  </>,
                ),
              )}
            </ul>
          )}

          {tab === 'requests' && (
            <div className="flex flex-col gap-4" data-testid="friends-requests">
              <ul className="divide-y divide-edge/20">
                {overview?.incoming.length === 0 && overview.outgoing.length === 0 && (
                  <li className="py-6 text-center text-muted">No open requests.</li>
                )}
                {overview?.incoming.map((p) =>
                  row(
                    p,
                    <span className="flex gap-2">
                      <Button
                        variant="gold"
                        className="min-h-9 !px-2.5 text-xs"
                        data-testid={`request-accept-${p.id}`}
                        onClick={() => void run(api.accept(p.id), 'You are friends now!')}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-9 !px-2.5 text-xs"
                        onClick={() => void run(api.decline(p.id))}
                      >
                        Decline
                      </Button>
                    </span>,
                    'wants to be your friend',
                  ),
                )}
              </ul>
              {(overview?.outgoing.length ?? 0) > 0 && (
                <div>
                  <p className="label mb-1 text-muted">Sent</p>
                  <ul className="divide-y divide-edge/20">
                    {overview!.outgoing.map((p) =>
                      row(
                        p,
                        <Button
                          variant="secondary"
                          className="min-h-9 !px-2.5 text-xs"
                          onClick={() => void run(api.decline(p.id))}
                        >
                          Cancel
                        </Button>,
                        'waiting for an answer',
                      ),
                    )}
                  </ul>
                </div>
              )}
              {(overview?.blocked.length ?? 0) > 0 && (
                <div>
                  <p className="label mb-1 text-muted">Blocked</p>
                  <ul className="divide-y divide-edge/20">
                    {overview!.blocked.map((p) =>
                      row(
                        p,
                        <Button
                          variant="secondary"
                          className="min-h-9 !px-2.5 text-xs"
                          onClick={() => void run(api.unblock(p.id))}
                        >
                          Unblock
                        </Button>,
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'find' && (
            <div className="flex flex-col gap-4">
              <input
                data-testid="friends-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a nickname…"
                maxLength={30}
                className="min-h-11 w-full rounded-md border-2 border-edge/50 bg-panel2 px-3 text-ink"
              />
              <ul className="divide-y divide-edge/20" data-testid="friends-found">
                {found.map((p) =>
                  row(
                    p,
                    p.state === 'none' ? (
                      <Button
                        className="min-h-9 !px-2.5 text-xs"
                        data-testid={`found-add-${p.id}`}
                        onClick={() =>
                          void api
                            .requestFriend({ userId: p.id })
                            .then((r) => {
                              toast.show(
                                r.state === 'friends'
                                  ? 'You are friends now!'
                                  : 'Friend request sent',
                                'info',
                              );
                              setFound((list) =>
                                list.map((x) => (x.id === p.id ? { ...x, state: r.state } : x)),
                              );
                              refresh();
                            })
                            .catch(fail)
                        }
                      >
                        Add
                      </Button>
                    ) : (
                      <span className="label text-muted">
                        {p.state === 'friends'
                          ? 'friends'
                          : p.state === 'incoming'
                            ? 'asked you'
                            : 'sent'}
                      </span>
                    ),
                  ),
                )}
              </ul>
              {overview && (
                <div className="rounded-lg border-2 border-edge/30 p-3">
                  <p className="label mb-1">Your invite link</p>
                  <p className="mb-2 break-all text-xs text-muted" data-testid="friends-link">
                    {link}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="min-h-10 flex-1 text-xs"
                      data-testid="friends-copy"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(link)
                          .then(() => toast.show('Link copied', 'info'))
                          .catch(() => toast.show(link, 'info'));
                      }}
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-10 flex-1 text-xs"
                      onClick={() =>
                        void run(api.newCode(), 'New link made: the old one stopped working')
                      }
                    >
                      New link
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </DetentSheet>
  );
}
