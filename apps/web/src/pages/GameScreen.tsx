import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, RoomView } from '@pogo/shared';
import type { ComponentType } from 'react';
import type { GameUiProps } from '../games/types';
import { Confetti } from '../components/Confetti';
import { TopoBackground } from '../components/TopoBackground';
import { Button, Sheet } from '../components/ui';
import { RegisterNudge } from '../components/RegisterNudge';
import { ChatPanel } from '../components/ChatPanel';
import { ArrowLeftIcon, ChatIcon } from '../components/icons';
import { TileButton, TopBar } from '../components/TopBar';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { AvatarFace } from '../components/AvatarFace';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';

/** Seconds the headline sits in the middle before it moves up, and the gap between the revealed rows. */
const HEAD_S = 2.4;
const ROW_S = 0.45;

const ordinal = (n: number) =>
  `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;

/**
 * The final standings, in sequence: the headline ("You won!", "2nd place!", "You lost!") in the
 * middle, then up to the top; the ranking drops in row by row (Mario Kart style, with the points
 * when the game has them); then the "keep your stats" card for guests; then the buttons come up
 * from the bottom. Full screen and scrollable.
 */
function ResultsPanel({
  room,
  me,
  api,
  title,
  showScores = true,
  sendMove,
  account,
  confetti = false,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  title?: string;
  showScores?: boolean;
  /** Confetti for the winner of a game with more than one player (games with their own fanfare skip it). */
  confetti?: boolean;
  sendMove: GameUiProps['sendMove'];
  /** Guests get a nudge to register under their results. */
  account?: AccountProps;
}) {
  // The status-bar strip and the home-indicator area outside the panel take its colour (see .results-open).
  useEffect(() => {
    document.documentElement.classList.add('results-open');
    return () => document.documentElement.classList.remove('results-open');
  }, []);
  const results = room.game?.results;
  if (!results) return null;
  const isHost = room.hostId === me;
  const rankings = results.rankings;
  const nameOf = (id: string) => room.members.find((x) => x.id === id);
  const mine = rankings.find((r) => r.playerId === me);
  const winner = nameOf(rankings[0]?.playerId ?? '')?.nickname ?? 'Someone';
  const headline = !mine
    ? (title ?? `${winner} wins!`)
    : mine.rank === 1
      ? 'You won!'
      : mine.rank === rankings.length
        ? (title ?? 'You lost!')
        : `${ordinal(mine.rank)} place!`;
  // Each step starts when the previous one has landed.
  const rowsDone = HEAD_S + rankings.length * ROW_S;
  const delay = (sec: number) => ({ animationDelay: `${sec}s` });
  const won = confetti && mine?.rank === 1 && rankings.length > 1;
  return (
    <>
      <div
        data-testid="results-panel"
        className="animate-slide-up screen-bg fixed inset-0 z-40 overflow-y-auto text-ink"
      >
        <TopoBackground />
        <div className="mx-auto flex min-h-full max-w-lg flex-col gap-5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+3.5rem)]">
          <h2
            data-testid="results-headline"
            className="res-head text-center text-3xl font-bold uppercase leading-tight tracking-[0.1em]"
          >
            {headline}
          </h2>

          {/* The standings sit in the middle of the free space between the headline and the lower group. */}
          <ol className="my-auto flex flex-col gap-2" data-testid="standings">
            {rankings.map((r, i) => {
              const m = nameOf(r.playerId);
              const isMe = r.playerId === me;
              return (
                <li
                  key={r.playerId}
                  data-testid={`rank-${r.rank}`}
                  className={`res-row flex items-end gap-2 rounded-md px-3 py-1.5 ${
                    i === 0 ? 'bg-neon text-accentink' : isMe ? 'bg-accent/25' : ''
                  }`}
                  style={delay(HEAD_S + i * ROW_S)}
                >
                  <span className="shrink-0 self-center text-xl leading-none" aria-hidden>
                    <AvatarFace avatar={m?.avatar ?? ''} />
                  </span>
                  <span className="min-w-0 truncate text-xl font-bold">
                    {m?.nickname ?? 'Player'}
                    {isMe && ' (you)'}
                  </span>
                  <span className="mb-1.5 min-w-4 flex-1 border-b-4 border-dotted border-current opacity-50" />
                  {/* Games with points show the total; the others the place. */}
                  <span className="text-xl font-bold tabular-nums">
                    {showScores ? r.score : r.rank}
                  </span>
                </li>
              );
            })}
          </ol>

          {account?.isGuest && (
            <div className="res-row" style={delay(rowsDone + 0.2)}>
              <RegisterNudge
                token={account.token}
                gameId={room.gameId}
                onRegister={account.onRegister}
              />
            </div>
          )}

          <div
            className="res-bottom flex flex-col gap-3"
            style={delay(rowsDone + (account?.isGuest ? 0.9 : 0.4))}
          >
            <>
              {/* Lobby takes everybody back to the room's lobby (Ready starts the next game). */}
              <Button
                data-testid="results-lobby"
                disabled={!api.online}
                onClick={() => void api.rematch(true)}
              >
                Lobby
              </Button>
              <Button
                variant="secondary"
                data-testid="results-leave"
                onClick={() => void api.leave()}
              >
                Exit
              </Button>
            </>
          </div>
        </div>
      </div>
      {won && <Confetti startS={0.3} />}
    </>
  );
}

export interface AccountProps {
  token: string;
  isGuest: boolean;
  onRegister: () => void;
}

export function GameScreen({
  room,
  me,
  api,
  messages,
  readUpTo,
  markRead,
  onSettings,
  account,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  messages: ChatMessage[];
  readUpTo: number;
  markRead: () => void;
  onSettings: () => void;
  account?: AccountProps;
}) {
  const ui = getGameUi(room.gameId);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Every new game (a rematch that starts at once) mounts the game afresh: no state of the last one.
  const [game, setGame] = useState(0);
  const [prevStatus, setPrevStatus] = useState(room.status);
  if (prevStatus !== room.status) {
    setPrevStatus(room.status);
    if (room.status === 'playing') setGame((g) => g + 1);
  }
  const [chatOpen, setChatOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const unread = messages.filter((m) => m.id > readUpTo && m.userId !== me).length;

  // While the chat sheet is open, new messages are read immediately.
  useEffect(() => {
    if (chatOpen) markRead();
  }, [chatOpen, markRead, messages.length]);
  const finished = room.status === 'finished';
  const ended = finished;

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
  // Fanfare once, when the standings appear (after the game's own final animation, e.g. a card turning).
  const fanfared = useRef(ended && resultsShown);
  useEffect(() => {
    if (!ended) fanfared.current = false;
    else if (resultsShown && !fanfared.current) {
      fanfared.current = true;
      if (ui?.ownFanfare) return;
      const won = room.game?.results?.rankings.some((r) => r.rank === 1 && r.playerId === me);
      play(won ? 'win' : 'score');
      haptic(won ? 'success' : 'tap');
    }
    wasFinished.current = ended;
  }, [ended, resultsShown, room.game?.results, me]);

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
          title={ui.name}
          onSettings={onSettings}
          actions={
            <>
              {ui.Rules && (
                <TileButton
                  small
                  onClick={() => setRulesOpen(true)}
                  aria-label="Rules"
                  data-testid="rules-open"
                >
                  <span className="text-lg font-bold leading-none">?</span>
                </TileButton>
              )}
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
            </>
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
          key={game}
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
          room={room}
          me={me}
          api={api}
          sendMove={api.move}
          title={ui.resultsTitle?.(room, me)}
          showScores={!ui.hideScores}
          account={account}
          confetti={!ui.ownFanfare}
        />
      )}

      {ui.Rules && <ui.Rules open={rulesOpen} onClose={() => setRulesOpen(false)} room={room} />}
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
