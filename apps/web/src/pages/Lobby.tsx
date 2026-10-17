import { getGame } from '@pogo/shared';
import type { RoomView } from '@pogo/shared';
import { Avatar, Button, Card } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { useToast } from '../components/Toast';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';

const TIMER_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '90s' },
  { value: 120, label: '2 min' },
];

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    'flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-black disabled:opacity-30 dark:bg-slate-800';
  return (
    <div className="flex items-center justify-between">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        <button
          className={btn}
          aria-label={`Fewer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span className="w-6 text-center text-xl font-black tabular-nums">{value}</span>
        <button
          className={btn}
          aria-label={`More ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Lobby({
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
  const toast = useToast();
  const isHost = room.hostId === me;
  const ui = getGameUi(room.gameId);
  const limits = getGame(room.gameId);
  const link = `${window.location.origin}/?join=${room.code}`;
  const host = room.members.find((m) => m.id === room.hostId);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my Pogo game',
          text: `Join me on Pogo! Code: ${room.code}`,
          url: link,
        });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.show('Invite link copied');
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing to do.
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar
        title={`${ui?.emoji ?? ''} ${room.gameName}`}
        subtitle="Waiting room"
        onSettings={onSettings}
      />
      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-2">
        <Card className="text-center">
          <div className="text-sm font-semibold text-slate-500">Room code</div>
          <div
            data-testid="room-code"
            className="my-1 select-all text-5xl font-black tracking-[0.25em] text-violet-600 dark:text-violet-400"
          >
            {room.code}
          </div>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => void share()}>
            Invite friends
          </Button>
        </Card>

        <section aria-label="Players">
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-black uppercase tracking-wider text-slate-500">
            Players
            <span data-testid="player-count">
              {room.members.length} / {room.maxPlayers}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {room.members.map((m) => (
              <li
                key={m.id}
                data-testid={`member-${m.nickname}`}
                className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm dark:bg-slate-900"
              >
                <Avatar avatar={m.avatar} dim={!m.connected} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {m.nickname}
                    {m.id === me && <span className="font-normal text-slate-500"> (you)</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {m.id === room.hostId ? '👑 Host' : m.connected ? 'Ready' : 'Reconnecting…'}
                  </div>
                </div>
                {isHost && m.id !== me && (
                  <button
                    onClick={() => void api.kick(m.id)}
                    className="min-h-10 rounded-xl px-3 text-sm font-bold text-rose-600"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isHost && limits && (
          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Settings</h2>
            {limits.maxPlayers > limits.minPlayers && (
              <Stepper
                label="Max players"
                value={room.maxPlayers}
                min={Math.max(limits.minPlayers, room.members.length)}
                max={limits.maxPlayers}
                onChange={(maxPlayers) => void api.updateSettings({ maxPlayers })}
              />
            )}
            <div>
              <div className="mb-2 font-semibold">Turn timer</div>
              <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
                {TIMER_CHOICES.map((t) => (
                  <button
                    key={t.value}
                    aria-pressed={room.turnTimeSec === t.value}
                    onClick={() => void api.updateSettings({ turnTimeSec: t.value })}
                    className={`min-h-11 rounded-xl text-sm font-bold ${
                      room.turnTimeSec === t.value
                        ? 'bg-white shadow dark:bg-slate-950'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          {isHost ? (
            <Button
              data-testid="lobby-start"
              disabled={!api.online || room.members.length < room.minPlayers}
              onClick={() => void api.start()}
            >
              {room.members.length < room.minPlayers
                ? `Need ${room.minPlayers} players`
                : room.members.length === 1
                  ? 'Start solo game'
                  : 'Start game'}
            </Button>
          ) : (
            <p className="text-center font-semibold text-slate-500" data-testid="lobby-waiting">
              Waiting for {host?.nickname ?? 'the host'} to start…
            </p>
          )}
          <Button variant="ghost" data-testid="lobby-leave" onClick={() => void api.leave()}>
            Leave room
          </Button>
        </div>
      </main>
    </div>
  );
}
