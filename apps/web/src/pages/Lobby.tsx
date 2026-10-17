import { useEffect } from 'react';
import { getGame } from '@pogo/shared';
import type { ChatMessage, RoomView } from '@pogo/shared';
import { CrownIcon } from '../components/icons';
import { ChatPanel } from '../components/ChatPanel';
import { Avatar, Button, Card, SectionLabel, Toggle } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { useToast } from '../components/Toast';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';

const TIMER_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 90, label: '90s' },
  { value: 120, label: '2m' },
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
    'flex h-12 w-12 items-center justify-center rounded-md border-2 border-neon text-2xl font-bold text-neon disabled:border-edge/30 disabled:text-muted/40';
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
        <span className="w-6 text-center text-xl font-bold tabular-nums">{value}</span>
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
  messages,
  markRead,
  onSettings,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  messages: ChatMessage[];
  markRead: () => void;
  onSettings: () => void;
}) {
  const toast = useToast();
  const isHost = room.hostId === me;
  const ui = getGameUi(room.gameId);
  const limits = getGame(room.gameId);
  const link = `${window.location.origin}/?join=${room.code}`;
  const host = room.members.find((m) => m.id === room.hostId);

  // The chat is on screen here, so everything counts as read.
  useEffect(markRead, [markRead, messages.length]);

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
      <main className="flex flex-1 flex-col gap-5 px-4 pb-8 pt-2">
        {/* Compact room code: the code on the left, the invite button on the right. */}
        <Card className="hud-ticks flex items-center justify-between gap-3 !p-3">
          <div className="min-w-0">
            <div className="label flex items-center gap-2 text-muted">
              Room code
              <span
                data-testid="room-visibility"
                className={`rounded border px-1.5 py-0.5 text-[9px] ${
                  room.visibility === 'public'
                    ? 'border-accent text-accent'
                    : 'border-edge/50 text-muted'
                }`}
              >
                {room.visibility === 'public' ? 'Public' : 'Private'}
              </span>
            </div>
            <div
              data-testid="room-code"
              className="select-all text-3xl font-bold leading-tight tracking-[0.2em] text-neon"
            >
              {room.code}
            </div>
          </div>
          <Button
            variant="secondary"
            aria-label="Invite friends"
            className="min-h-11 shrink-0 !px-4"
            onClick={() => void share()}
          >
            Invite
          </Button>
        </Card>

        <section aria-label="Players">
          <SectionLabel
            right={
              <span data-testid="player-count" className="text-onbg">
                {room.members.length} / {room.maxPlayers}
              </span>
            }
          >
            Crew
          </SectionLabel>
          <ul className="flex flex-col gap-2">
            {room.members.map((m) => (
              <li
                key={m.id}
                data-testid={`member-${m.nickname}`}
                className="hud flex items-center gap-3 px-3 py-2.5"
              >
                <Avatar avatar={m.avatar} dim={!m.connected} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {m.nickname}
                    {m.id === me && <span className="font-normal text-muted"> (you)</span>}
                  </div>
                  <div className="label flex items-center gap-1.5 text-[10px] text-muted">
                    {m.id === room.hostId ? (
                      <>
                        <CrownIcon className="h-3.5 w-3.5 text-accent" /> Host
                      </>
                    ) : m.connected ? (
                      'Ready'
                    ) : (
                      'Reconnecting…'
                    )}
                  </div>
                </div>
                {isHost && m.id !== me && (
                  <button
                    onClick={() => void api.kick(m.id)}
                    className="label min-h-10 rounded-md px-3 text-danger"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isHost && limits && (
          <section aria-label="Settings">
            <SectionLabel>Settings</SectionLabel>
            <Card className="flex flex-col gap-5">
              <Toggle
                label="Public room"
                hint="Show in the lobby so anyone can join"
                checked={room.visibility === 'public'}
                onChange={(isPublic) =>
                  void api.updateSettings({ visibility: isPublic ? 'public' : 'private' })
                }
              />
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
                <div className="grid grid-cols-5 gap-2">
                  {TIMER_CHOICES.map((t) => (
                    <button
                      key={t.value}
                      aria-pressed={room.turnTimeSec === t.value}
                      onClick={() => void api.updateSettings({ turnTimeSec: t.value })}
                      className={`min-h-11 rounded-md border-2 text-sm font-bold ${
                        room.turnTimeSec === t.value
                          ? 'border-accent bg-accent text-accentink'
                          : 'border-edge/40 text-muted'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </section>
        )}

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
          <p className="label text-center text-onbg" data-testid="lobby-waiting">
            Waiting for {host?.nickname ?? 'the host'} to start…
          </p>
        )}

        <section aria-label="Chat">
          <SectionLabel>Chat</SectionLabel>
          <ChatPanel messages={messages} me={me} online={api.online} onSend={api.sendChat} />
        </section>

        <div className="mt-auto pt-2">
          <Button
            variant="ghost"
            data-testid="lobby-leave"
            className="w-full"
            onClick={() => void api.leave()}
          >
            Leave room
          </Button>
        </div>
      </main>
    </div>
  );
}
