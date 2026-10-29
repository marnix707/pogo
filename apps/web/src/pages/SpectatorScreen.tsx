import type { ChatMessage, RoomView } from '@pogo/shared';
import { ChatPanel } from '../components/ChatPanel';
import { PlayerName } from '../components/PlayerName';
import { ArrowLeftIcon } from '../components/icons';
import { TileButton, TopBar } from '../components/TopBar';
import { Avatar, Button, SectionLabel } from '../components/ui';
import { FriendsButton } from '../friends/FriendsButton';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';

/**
 * Watching a game you are not in: who plays (and whose turn it is), the standings once it ends, and the
 * room chat (spectators and players share it). No game view is sent to watchers, so nothing private leaks;
 * when the players go back to the lobby the watchers get a seat in the next game.
 */
export function SpectatorScreen({
  room,
  me,
  api,
  messages,
  onSettings,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  messages: ChatMessage[];
  onSettings: () => void;
}) {
  const ui = getGameUi(room.gameId);
  const current = room.game?.currentPlayers ?? [];
  const rankings = room.game?.results?.rankings;
  const finished = room.status === 'finished';
  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col" data-testid="spectator-screen">
      <TopBar
        title={ui?.name ?? room.gameName}
        logo={ui?.logo}
        titleExtra="👀"
        onSettings={onSettings}
        actions={<FriendsButton small />}
        compact
        left={
          <TileButton
            small
            onClick={() => void api.leave()}
            aria-label="Stop watching"
            data-testid="leave-game"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </TileButton>
        }
      />
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <p className="label text-onbg" data-testid="spectating-note" role="status">
          {finished
            ? 'The game is over. When the players go back to the lobby you play the next one with them.'
            : 'You are watching. You play the next game with these players.'}
        </p>
        <section aria-label="Players">
          <SectionLabel>{finished ? 'Result' : 'Players'}</SectionLabel>
          <ul className="flex flex-col gap-2">
            {(rankings
              ? rankings.map((r) => ({
                  m: room.members.find((x) => x.id === r.playerId),
                  rank: r.rank,
                }))
              : room.members.map((m) => ({ m, rank: 0 }))
            ).map(({ m, rank }) =>
              m ? (
                <li
                  key={m.id}
                  data-testid={`spectate-player-${m.id}`}
                  className={`hud calm flex items-center gap-3 px-3 py-2 ${
                    current.includes(m.id) && !finished ? 'ring-2 ring-neon' : ''
                  } ${m.left ? 'opacity-60' : ''}`}
                >
                  <Avatar avatar={m.avatar} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold">
                    <PlayerName name={m.nickname} id={m.id} me={me} />
                    {m.bot && ' 🤖'}
                  </span>
                  {rank > 0 ? (
                    <span className="font-bold tabular-nums">#{rank}</span>
                  ) : (
                    current.includes(m.id) && <span className="label text-[10px]">Turn</span>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        </section>
        {room.spectators.length > 1 && (
          <p className="label text-onbg/80" data-testid="spectator-count">
            👀 {room.spectators.length} watching
          </p>
        )}
        <section aria-label="Chat">
          <SectionLabel>Chat</SectionLabel>
          <ChatPanel
            messages={messages}
            me={me}
            online={api.online}
            onSend={api.sendChat}
            heightClass="h-[34dvh]"
          />
        </section>
        <Button variant="secondary" onClick={() => void api.leave()} data-testid="stop-watching">
          Stop watching
        </Button>
      </main>
    </div>
  );
}
