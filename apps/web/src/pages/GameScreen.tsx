import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, RoomView } from '@pogo/shared';
import type { ComponentType } from 'react';
import type { GameUiProps } from '../games/types';
import { Button, Sheet } from '../components/ui';
import { ChatPanel } from '../components/ChatPanel';
import { ArrowLeftIcon, ChatIcon } from '../components/icons';
import { TileButton, TopBar } from '../components/TopBar';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { avatarEmoji } from '../lib/avatars';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Podium bar heights (rem) for 1st, 2nd and 3rd, and when each rises. */
const PODIUM_HEIGHT = ['9rem', '6.5rem', '5rem'];
const PODIUM_DELAY = ['1.1s', '0.55s', '0s'];

/** The final standings: a podium for the top three, a list for everybody else. Full screen and scrollable. */
function ResultsPanel({
  room,
  me,
  api,
  title,
  showScores = true,
  restarts = false,
  pending = false,
  extra,
  sendMove,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  title?: string;
  showScores?: boolean;
  /** "Play again" restarts at once, so the waiting room needs its own button. */
  restarts?: boolean;
  /** The game still needs something from the players: no rematch buttons yet. */
  pending?: boolean;
  /** Game-specific section between the standings and the buttons. */
  extra?: ComponentType<GameUiProps>;
  sendMove: GameUiProps['sendMove'];
}) {
  const Extra = extra;
  const results = room.game?.results;
  if (!results) return null;
  const isHost = room.hostId === me;
  const best = results.rankings[0];
  const iWon = results.rankings.some((r) => r.rank === 1 && r.playerId === me);
  const rankings = results.rankings;
  // Left to right: 2nd, 1st, 3rd (the classic podium); with two players just 2nd, 1st.
  const podium = [1, 0, 2].filter((i) => i < rankings.length);
  const rest = rankings.slice(3);
  const nameOf = (id: string) => room.members.find((x) => x.id === id);
  return (
    <div
      data-testid="results-panel"
      className="animate-slide-up fixed inset-0 z-40 overflow-y-auto bg-panel text-ink"
    >
      <div className="mx-auto flex min-h-full max-w-lg flex-col gap-5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <h2 className="text-center text-2xl font-bold uppercase tracking-[0.12em]">
          {title ??
            (iWon ? '🎉 You won!' : `🏆 ${nameOf(best?.playerId ?? '')?.nickname ?? ''} wins!`)}
        </h2>

        <ol className="flex items-end justify-center gap-2 pt-2" data-testid="podium">
          {podium.map((i) => {
            const r = rankings[i]!;
            const m = nameOf(r.playerId);
            const mine = r.playerId === me;
            return (
              <li
                key={r.playerId}
                data-testid={`rank-${r.rank}`}
                data-place={i + 1}
                className="flex min-w-0 flex-1 flex-col items-center"
              >
                <div
                  className="podium-top flex w-full flex-col items-center gap-0.5 pb-1.5"
                  style={{ animationDelay: `calc(${PODIUM_DELAY[i]} + 0.5s)` }}
                >
                  <span className="text-3xl leading-none">{MEDALS[r.rank - 1] ?? r.rank}</span>
                  <span className="text-3xl leading-none" aria-hidden>
                    {avatarEmoji(m?.avatar ?? '')}
                  </span>
                  <span
                    className={`w-full truncate text-center text-sm font-bold ${mine ? 'text-accent' : ''}`}
                  >
                    {m?.nickname ?? 'Player'}
                    {mine && ' (you)'}
                  </span>
                  {showScores && (
                    <span className="text-sm font-bold tabular-nums text-neon">{r.score}</span>
                  )}
                </div>
                <div
                  className={`podium-bar flex w-full items-start justify-center rounded-t-lg border-2 border-b-0 pt-2 text-3xl font-bold ${
                    mine ? 'border-accent bg-accent/25' : 'border-edge/50 bg-panel2'
                  }`}
                  style={{ height: PODIUM_HEIGHT[i], animationDelay: PODIUM_DELAY[i] }}
                >
                  {r.rank}
                </div>
              </li>
            );
          })}
        </ol>

        {rest.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {rest.map((r) => {
              const m = nameOf(r.playerId);
              return (
                <li
                  key={r.playerId}
                  data-testid={`rank-${r.rank}`}
                  className={`flex items-center gap-3 rounded-md border-2 px-3 py-2 ${
                    r.playerId === me ? 'border-accent bg-accent/15' : 'border-edge/30 bg-panel2'
                  }`}
                >
                  <span className="w-8 text-center text-xl font-bold">{r.rank}</span>
                  <span aria-hidden>{avatarEmoji(m?.avatar ?? '')}</span>
                  <span className="flex-1 truncate font-bold">
                    {m?.nickname ?? 'Player'}
                    {r.playerId === me && ' (you)'}
                  </span>
                  {showScores && (
                    <span className="text-xl font-bold tabular-nums text-neon">{r.score}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {Extra && <Extra room={room} me={me} sendMove={sendMove} />}

        <div className="mt-auto flex flex-col gap-3">
          {pending ? (
            <p className="label text-center text-muted">Almost there…</p>
          ) : isHost ? (
            <>
              <Button data-testid="rematch" disabled={!api.online} onClick={() => void api.rematch()}>
                Play again
              </Button>
              {restarts && (
                <Button
                  variant="secondary"
                  data-testid="back-to-lobby"
                  disabled={!api.online}
                  onClick={() => void api.rematch(true)}
                >
                  Back to lobby
                </Button>
              )}
            </>
          ) : (
            <p className="label text-center text-muted">Waiting for the host to start a rematch…</p>
          )}
          <Button variant="secondary" data-testid="results-leave" onClick={() => void api.leave()}>
            Leave room
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GameScreen({
  room,
  me,
  api,
  messages,
  readUpTo,
  markRead,
  onSettings,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  messages: ChatMessage[];
  readUpTo: number;
  markRead: () => void;
  onSettings: () => void;
}) {
  const ui = getGameUi(room.gameId);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const unread = messages.filter((m) => m.id > readUpTo && m.userId !== me).length;

  // While the chat sheet is open, new messages are read immediately.
  useEffect(() => {
    if (chatOpen) markRead();
  }, [chatOpen, markRead, messages.length]);
  const finished = room.status === 'finished';
  // A game can be over for the standings while it still waits for something (Karma: the winner's rule).
  const pendingResults = room.status === 'playing' ? (ui?.pendingResults?.(room) ?? null) : null;
  const ended = finished || pendingResults !== null;
  const panelRoom: RoomView =
    pendingResults && room.game ? { ...room, game: { ...room.game, results: pendingResults } } : room;

  // Fanfare once when the game ends.
  const wasFinished = useRef(ended);
  // Standings appear at once when you open a finished game, but after the game's own final
  // animation (e.g. Karma's win reveal) when the game ends while you watch.
  const [resultsShown, setResultsShown] = useState(ended);
  const resultsDelay = ui?.resultsDelayMs?.(room) ?? 0;
  useEffect(() => {
    if (!ended) return setResultsShown(false);
    if (wasFinished.current || resultsDelay === 0) return setResultsShown(true);
    const t = setTimeout(() => setResultsShown(true), resultsDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  useEffect(() => {
    if (ended && !wasFinished.current) {
      const won = panelRoom.game?.results?.rankings.some((r) => r.rank === 1 && r.playerId === me);
      play(won ? 'win' : 'score');
      haptic(won ? 'success' : 'tap');
    }
    wasFinished.current = ended;
  }, [ended, panelRoom.game?.results, me]);

  if (!ui) {
    return (
      <div className="p-6 text-center">
        <p className="mb-4">This game isn&apos;t supported by your app version. Try refreshing.</p>
        <Button onClick={() => void api.leave()}>Leave room</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      {!ui.ownHeader && (
        <TopBar
          title={`${ui.emoji} ${ui.name}`}
          subtitle={`Room ${room.code}`}
          onSettings={onSettings}
          actions={
            <TileButton
              small
              onClick={() => setChatOpen(true)}
              aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
              data-testid="chat-open"
            >
              <span className="relative">
                <ChatIcon className="h-5 w-5" />
                {unread > 0 && (
                  <span
                    data-testid="chat-badge"
                    className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accentink"
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
            </TileButton>
          }
          compact
          left={
            <TileButton
              small
              onClick={() => (finished ? void api.leave() : setConfirmLeave(true))}
              aria-label="Leave game"
              data-testid="leave-game"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </TileButton>
          }
        />
      )}
      <div className="min-h-0 flex-1">
        <ui.Component
          room={room}
          me={me}
          sendMove={api.move}
          chrome={{
            onLeave: () => (finished ? void api.leave() : setConfirmLeave(true)),
            onChat: () => setChatOpen(true),
            onSettings,
            unread,
          }}
        />
      </div>
      {ended && resultsShown && (
        <ResultsPanel
          room={panelRoom}
          me={me}
          api={api}
          sendMove={api.move}
          pending={pendingResults !== null}
          extra={ui.ResultsExtra}
          title={ui.resultsTitle?.(panelRoom, me)}
          showScores={!ui.hideScores}
          restarts={ui.playAgainRestarts}
        />
      )}

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title={`Chat · Room ${room.code}`}>
        <ChatPanel
          messages={messages}
          me={me}
          online={api.online}
          onSend={api.sendChat}
          heightClass="h-[40dvh]"
        />
      </Sheet>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this game?">
        <p className="mb-4 text-muted">
          Your seat stays in the game and will be played automatically until it ends.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="danger" onClick={() => void api.leave()}>
            Leave game
          </Button>
          <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
            Keep playing
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
