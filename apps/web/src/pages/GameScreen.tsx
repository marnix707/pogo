import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@pogo/shared';
import { Button, Sheet } from '../components/ui';
import { ArrowLeftIcon } from '../components/icons';
import { TileButton, TopBar } from '../components/TopBar';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { avatarEmoji } from '../lib/avatars';
import { haptic } from '../lib/haptics';
import { play } from '../lib/sound';

const MEDALS = ['🥇', '🥈', '🥉'];

function ResultsPanel({ room, me, api }: { room: RoomView; me: string; api: RoomApi }) {
  const results = room.game?.results;
  if (!results) return null;
  const isHost = room.hostId === me;
  const best = results.rankings[0];
  const iWon = results.rankings.some((r) => r.rank === 1 && r.playerId === me);
  return (
    <div
      data-testid="results-panel"
      className="animate-slide-up border-t-2 border-edge/60 bg-panel px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-ink"
    >
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <h2 className="text-center text-2xl font-bold uppercase tracking-[0.12em]">
          {iWon
            ? '🎉 You won!'
            : `🏆 ${room.members.find((m) => m.id === best?.playerId)?.nickname ?? ''} wins!`}
        </h2>
        <ol className="flex flex-col gap-1.5">
          {results.rankings.map((r) => {
            const m = room.members.find((x) => x.id === r.playerId);
            return (
              <li
                key={r.playerId}
                data-testid={`rank-${r.rank}`}
                className={`flex items-center gap-3 rounded-md border-2 px-3 py-2 ${
                  r.playerId === me ? 'border-accent bg-accent/15' : 'border-edge/30 bg-panel2'
                }`}
              >
                <span className="w-8 text-center text-2xl">{MEDALS[r.rank - 1] ?? r.rank}</span>
                <span aria-hidden>{avatarEmoji(m?.avatar ?? '')}</span>
                <span className="flex-1 truncate font-bold">
                  {m?.nickname ?? 'Player'}
                  {r.playerId === me && ' (you)'}
                </span>
                <span className="text-xl font-bold tabular-nums text-neon">{r.score}</span>
              </li>
            );
          })}
        </ol>
        {isHost ? (
          <Button data-testid="rematch" disabled={!api.online} onClick={() => void api.rematch()}>
            Play again
          </Button>
        ) : (
          <p className="label text-center text-muted">Waiting for the host to start a rematch…</p>
        )}
        <Button variant="ghost" data-testid="results-leave" onClick={() => void api.leave()}>
          Leave room
        </Button>
      </div>
    </div>
  );
}

export function GameScreen({
  room,
  me,
  api,
  onSettings,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  onSettings: () => void;
}) {
  const ui = getGameUi(room.gameId);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const finished = room.status === 'finished';

  // Fanfare once when the game ends.
  const wasFinished = useRef(finished);
  useEffect(() => {
    if (finished && !wasFinished.current) {
      const won = room.game?.results?.rankings.some((r) => r.rank === 1 && r.playerId === me);
      play(won ? 'win' : 'score');
      haptic(won ? 'success' : 'tap');
    }
    wasFinished.current = finished;
  }, [finished, room.game?.results, me]);

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
      <TopBar
        title={`${ui.emoji} ${ui.name}`}
        subtitle={`Room ${room.code}`}
        onSettings={onSettings}
        left={
          <TileButton
            onClick={() => (finished ? void api.leave() : setConfirmLeave(true))}
            aria-label="Leave game"
            data-testid="leave-game"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </TileButton>
        }
      />
      <div className="min-h-0 flex-1">
        <ui.Component room={room} me={me} sendMove={api.move} />
      </div>
      {finished && <ResultsPanel room={room} me={me} api={api} />}

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
