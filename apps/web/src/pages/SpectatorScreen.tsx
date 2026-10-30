import type { ChatMessage, RoomView } from '@pogo/shared';
import { ChatPanel } from '../components/ChatPanel';
import { ArrowLeftIcon } from '../components/icons';
import { TileButton, TopBar } from '../components/TopBar';
import { Button } from '../components/ui';
import { FriendsButton } from '../friends/FriendsButton';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';

/**
 * Watching a game you are not in: the room chat on top, the whole game below (the game's own screen with the
 * watcher's view: `GameDefinition.getSpectatorView`, so nothing private leaks). When the players go back to the
 * lobby the watchers get a seat in the next game.
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
  const finished = room.status === 'finished';
  const rankings = room.game?.results?.rankings;
  const winner = rankings
    ? room.members.find((m) => m.id === rankings[0]?.playerId)?.nickname
    : undefined;
  const bar = (
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
  );
  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col" data-testid="spectator-screen">
      {!ui?.ownHeader && bar}
      {/* The room chat sits above the game; the game below is the whole thing, seen from outside. */}
      <section aria-label="Chat" className="shrink-0 px-4 pb-2">
        <p className="label mb-1 truncate text-onbg" data-testid="spectating-note" role="status">
          {finished
            ? `${winner ? `${winner} won. ` : 'Game over. '}You play the next one with them.`
            : 'Watching · you play the next game with them'}
          {room.spectators.length > 1 && (
            <span data-testid="spectator-count"> 👀 {room.spectators.length}</span>
          )}
        </p>
        <ChatPanel
          messages={messages}
          me={me}
          online={api.online}
          onSend={api.sendChat}
          heightClass="h-[13dvh]"
        />
      </section>
      <div className="min-h-0 flex-1" data-testid="spectator-game">
        {ui && room.game?.view != null ? (
          <ui.Component
            key={room.gameId}
            room={room}
            me={me}
            sendMove={api.move}
            chrome={{
              onLeave: () => void api.leave(),
              onChat: () => undefined,
              onSettings,
              unread: 0,
            }}
          />
        ) : (
          <p className="p-6 text-center text-onbg">Waiting for the game…</p>
        )}
      </div>
      <Button
        variant="secondary"
        className="mx-4 mb-3 shrink-0"
        onClick={() => void api.leave()}
        data-testid="stop-watching"
      >
        Stop watching
      </Button>
    </div>
  );
}
