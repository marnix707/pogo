import { useCallback, useEffect, useState } from 'react';
import type { PersonView, ProfileView, TogetherView } from '@pogo/shared';
import { getGameUi } from '../games/registry';
import { Avatar, Button, Sheet } from '../components/ui';
import { PlayerName } from '../components/PlayerName';
import { timeAgo } from '../components/MatchHistory';
import { useToast } from '../components/Toast';
import type { FriendsApi } from '../lib/friendsApi';

/** A player's profile card (tap a player anywhere): a few stats and what you can do with them. */
export function ProfileCard({
  id,
  me,
  api,
  refresh,
  inLobbyCode,
  onClose,
  openThread,
}: {
  id: string | null;
  me: string;
  api: FriendsApi;
  refresh: () => void;
  inLobbyCode: string | null;
  onClose: () => void;
  openThread: (p: PersonView) => void;
}) {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  // The card has a Stats button: their stats and the games you played together.
  const [view, setView] = useState<'card' | 'stats'>('card');
  const [together, setTogether] = useState<TogetherView | null>(null);
  const load = useCallback(() => {
    if (!id) return;
    api
      .profile(id)
      .then(setProfile)
      .catch((e: Error) => {
        toast.show(e.message, 'error');
        onClose();
      });
  }, [api, id, onClose, toast]);
  useEffect(() => {
    setProfile(null);
    setConfirmBlock(false);
    setView('card');
    setTogether(null);
    load();
  }, [load]);

  const act = (p: Promise<unknown>, ok?: string) =>
    p
      .then(() => {
        if (ok) toast.show(ok, 'info');
        refresh();
        load();
      })
      .catch((e: Error) => toast.show(e.message, 'error'));

  const p = profile;
  const self = id === me;
  return (
    <Sheet open={!!id} onClose={onClose} title="Player">
      {!p ? (
        <p className="py-6 text-center text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4" data-testid="profile-card">
          <div className="flex items-center gap-4">
            <Avatar avatar={p.avatar} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-xl font-bold">
                <PlayerName name={p.name} />
              </div>
              <div className="label text-muted">
                {p.isGuest ? 'Guest' : p.online ? '● online' : '○ offline'}
                {p.state === 'friends' && ' · friends'}
              </div>
            </div>
          </div>

          {view === 'card' && (
            <Button
              variant="secondary"
              data-testid="profile-stats-open"
              onClick={() => {
                setView('stats');
                if (!self && !together)
                  api
                    .together(p.id)
                    .then(setTogether)
                    .catch((e: Error) => toast.show(e.message, 'error'));
              }}
            >
              Stats
            </Button>
          )}

          {view === 'stats' && (
            <div className="flex flex-col gap-4" data-testid="profile-stats-view">
              <Button
                variant="secondary"
                data-testid="profile-stats-back"
                onClick={() => setView('card')}
              >
                ‹ Back
              </Button>
              <section aria-label="Stats">
                <h3 className="label mb-1 text-muted">{self ? 'Your stats' : 'Their stats'}</h3>
                {p.stats.length === 0 ? (
                  <p className="text-sm text-muted">
                    {p.isGuest ? 'Guests have no stats.' : 'No games played yet.'}
                  </p>
                ) : (
                  <ul className="grid gap-1 text-sm" data-testid="profile-stats">
                    {p.stats.map((s) => (
                      <li
                        key={s.gameId}
                        className="flex justify-between border-b border-edge/20 py-1"
                      >
                        <span>{getGameUi(s.gameId)?.name ?? s.gameId}</span>
                        <span className="text-muted">
                          {s.games} played · {s.wins} won · best {s.bestScore}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {!self && (
                <section aria-label="Together" data-testid="profile-together">
                  <h3 className="label mb-1 text-muted">Played together</h3>
                  {together === null ? (
                    <p className="label text-muted">Loading…</p>
                  ) : together.games === 0 ? (
                    <p className="text-sm text-muted">You have not played a game together yet.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          ['You won', together.myWins],
                          ['They won', together.theirWins],
                          ['Draws', together.ties],
                        ].map(([label, n]) => (
                          <div key={label} className="hud calm px-1 py-2">
                            <div className="text-xl font-bold tabular-nums">{n}</div>
                            <div className="label text-[10px] text-muted">{label}</div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-sm" data-testid="together-summary">
                        {together.games} {together.games === 1 ? 'game' : 'games'} together
                        {together.lastAt ? ` · last ${timeAgo(together.lastAt)}` : ''}
                      </p>
                      <p className="text-sm text-muted" data-testid="together-most">
                        Most played together:{' '}
                        <b className="text-ink">
                          {getGameUi(together.byGame[0]!.gameId)?.name ??
                            together.byGame[0]!.gameId}
                        </b>{' '}
                        ({together.byGame[0]!.games})
                      </p>
                      <ul className="mt-1 grid gap-1 text-sm">
                        {together.byGame.map((g) => (
                          <li
                            key={g.gameId}
                            className="flex justify-between border-b border-edge/20 py-1"
                          >
                            <span>{getGameUi(g.gameId)?.name ?? g.gameId}</span>
                            <span className="text-muted">
                              {g.games} played · you {g.myWins} – {g.theirWins} them
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
            </div>
          )}

          {view === 'card' && !self && !p.isGuest && (
            <div className="flex flex-col gap-2">
              {p.state === 'none' && (
                <Button
                  data-testid="profile-add"
                  onClick={() =>
                    void api
                      .requestFriend({ userId: p.id })
                      .then((r) => {
                        toast.show(
                          r.state === 'friends' ? 'You are friends now!' : 'Friend request sent',
                          'info',
                        );
                        refresh();
                        load();
                      })
                      .catch((e: Error) => toast.show(e.message, 'error'))
                  }
                >
                  Add friend
                </Button>
              )}
              {p.state === 'outgoing' && (
                <Button
                  variant="secondary"
                  onClick={() => void act(api.decline(p.id), 'Request cancelled')}
                >
                  Cancel request
                </Button>
              )}
              {p.state === 'incoming' && (
                <div className="flex gap-2">
                  <Button
                    variant="gold"
                    className="flex-1"
                    onClick={() => void act(api.accept(p.id), 'You are friends now!')}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void act(api.decline(p.id))}
                  >
                    Decline
                  </Button>
                </div>
              )}
              {p.state === 'friends' && (
                <>
                  <Button data-testid="profile-message" onClick={() => openThread(p)}>
                    Message
                  </Button>
                  {inLobbyCode && (
                    <Button
                      variant="gold"
                      data-testid="profile-invite"
                      onClick={() => void act(api.invite(p.id, inLobbyCode), 'Invite sent')}
                    >
                      Invite to my lobby
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      data-testid="profile-mute"
                      onClick={() =>
                        void act(
                          p.muted ? api.unmute(p.id) : api.mute(p.id),
                          p.muted ? 'Unmuted' : 'Muted',
                        )
                      }
                    >
                      {p.muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => void act(api.remove(p.id), 'Friend removed')}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              )}
              {p.state === 'blocked' ? (
                <Button
                  variant="secondary"
                  onClick={() => void act(api.unblock(p.id), 'Unblocked')}
                >
                  Unblock
                </Button>
              ) : confirmBlock ? (
                <Button
                  variant="danger"
                  data-testid="profile-block-confirm"
                  onClick={() => void act(api.block(p.id), 'Blocked')}
                >
                  Really block {p.name}?
                </Button>
              ) : (
                <Button
                  variant="danger"
                  data-testid="profile-block"
                  onClick={() => setConfirmBlock(true)}
                >
                  Block
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
