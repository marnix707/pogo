import { useEffect } from 'react';
import { BOT_AVATAR, BOT_NAMES, getGame } from '@pogo/shared';
import type { ChatMessage, RoomView } from '@pogo/shared';
import { ArrowLeftIcon, CrownIcon, SlidersIcon } from '../components/icons';
import { ChatPanel } from '../components/ChatPanel';
import { Avatar, Button, Card, SectionLabel, Toggle } from '../components/ui';
import { TileButton } from '../components/TopBar';
import { useToast } from '../components/Toast';
import { getGameUi } from '../games/registry';
import type { RoomApi } from '../lib/api';
import { useCountdown } from '../lib/useCountdown';

const TIMER_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
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
  const iAmReady = !!room.members.find((m) => m.id === me)?.ready;
  const readyCount = room.members.filter((m) => m.ready).length;
  const secondsToStart = useCountdown(room.startsAt, room.serverTime);
  const ui = getGameUi(room.gameId);
  const limits = getGame(room.gameId);
  // Same naming as the server's makeBots: the first free names from the list.
  const taken = new Set(room.members.map((m) => m.nickname.toLowerCase()));
  const freeNames = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  const botSeats = Array.from({ length: room.bots }, (_, i) => freeNames[i] ?? `Bot ${i + 1}`);
  const link = `${window.location.origin}/?join=${room.code}`;

  // The chat is on screen here, so everything counts as read.
  useEffect(markRead, [markRead, messages.length]);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my POGO game',
          text: `Join me on POGO! Code: ${room.code}`,
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
    <div className="menu mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-5 px-4 pb-40 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        {/* One slim header card: back, game, Invite and settings. */}
        <Card className="hud-ticks !p-3">
          <div className="flex items-center gap-2">
            <TileButton
              onClick={() => void api.leave()}
              aria-label="Leave room"
              data-testid="lobby-leave"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </TileButton>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold uppercase leading-tight tracking-[0.08em] max-[380px]:text-base max-[380px]:tracking-normal">
                {room.gameName}
              </h1>
              <div className="label flex items-center gap-2 text-[10px] text-muted">
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
            </div>
            {/* A public lobby shows its code at the top, between the title and Invite. */}
            {room.visibility === 'public' && (
              <span
                data-testid="room-code"
                className="shrink-0 select-all text-sm font-bold leading-none tracking-[0.1em] text-neon max-[380px]:text-xs max-[380px]:tracking-normal"
              >
                {room.code}
              </span>
            )}
            <Button
              variant="secondary"
              aria-label="Invite friends"
              className="min-h-10 shrink-0 !px-2"
              onClick={() => void share()}
            >
              Invite
            </Button>
            <TileButton onClick={onSettings} aria-label="Settings" data-testid="settings-button">
              <SlidersIcon className="h-5 w-5" />
            </TileButton>
          </div>
        </Card>

        {/* Block 1: the game mode (when the game has one) with the turn timer underneath. */}
        {(ui?.LobbyOptions || (isHost && limits)) && (
          <section aria-label="Game settings">
            <SectionLabel>{ui?.LobbyOptions ? 'Game mode' : 'Settings'}</SectionLabel>
            <Card className="flex flex-col gap-5">
              {ui?.LobbyOptions && (
                <ui.LobbyOptions
                  room={room}
                  isHost={isHost}
                  setOptions={(options) => void api.updateSettings({ options })}
                />
              )}
              {isHost && limits && (
                <div className="flex items-center gap-3">
                  <div className="shrink-0 font-semibold">Turn timer</div>
                  <div className="grid flex-1 grid-cols-4 gap-1.5" data-testid="turn-timer">
                    {TIMER_CHOICES.map((t) => (
                      <button
                        key={t.value}
                        aria-pressed={room.turnTimeSec === t.value}
                        onClick={() => void api.updateSettings({ turnTimeSec: t.value })}
                        className={`min-h-11 rounded-md border-2 px-0 text-sm font-bold ${
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
              )}
            </Card>
          </section>
        )}

        {/* Block 2: public or private; a public lobby shows its code under the switch. */}
        {isHost && limits && (
          <section aria-label="Visibility">
            <Card>
              <Toggle
                label="Public room"
                checked={room.visibility === 'public'}
                onChange={(isPublic) =>
                  void api.updateSettings({ visibility: isPublic ? 'public' : 'private' })
                }
              />
            </Card>
          </section>
        )}

        {/* Block 3: computer players. The table size is simply the game's maximum. */}
        {isHost && limits?.supportsBots && (
          <section aria-label="Computer players">
            <Card>
              <Stepper
                label="Computer players"
                value={room.bots}
                min={0}
                max={limits.maxPlayers - room.members.length}
                onChange={(bots) => void api.updateSettings({ bots })}
              />
            </Card>
          </section>
        )}

        <section aria-label="Players">
          <SectionLabel
            right={
              <span data-testid="player-count" className="text-onbg">
                {room.members.length + room.bots} / {room.maxPlayers}
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
                    {m.id === room.hostId && (
                      <>
                        <CrownIcon className="h-3.5 w-3.5 text-accent" /> Host ·
                      </>
                    )}
                    {!m.connected ? 'Reconnecting…' : m.ready ? 'Ready ✓' : 'Not ready'}
                  </div>
                </div>
                {isHost && m.id !== me && (
                  <button
                    onClick={() => void api.kick(m.id)}
                    className="label min-h-10 rounded-md px-3 text-dangertext"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
            {/* Computer players take a seat when the game starts; they already show here. */}
            {botSeats.map((name, i) => (
              <li
                key={`bot-${i}`}
                data-testid={`bot-seat-${i + 1}`}
                className="hud flex items-center gap-3 px-3 py-2.5"
              >
                <Avatar avatar={BOT_AVATAR} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{name}</div>
                  <div className="label text-[10px] text-muted">Computer</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Chat">
          <SectionLabel>Chat</SectionLabel>
          <ChatPanel messages={messages} me={me} online={api.online} onSend={api.sendChat} />
        </section>
      </main>

      {/* The start button stays fixed to the bottom of the screen; the page scrolls behind it. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8"
        style={{
          // Solid behind the buttons (a disabled one is translucent), fading out above them.
          background: 'linear-gradient(to top, rgb(var(--c-page)) 70%, rgb(var(--c-page) / 0))',
        }}
        data-testid="lobby-bar"
      >
        <div className="pointer-events-auto mx-auto flex max-w-md flex-col gap-1">
          <p className="label text-center text-onbg" data-testid="lobby-ready-count">
            Ready {readyCount}/{room.members.length}
            {room.members.length + room.bots < room.minPlayers &&
              ` · Need ${room.minPlayers} players`}
          </p>
          {secondsToStart !== null && (
            <p
              className="text-center text-xl font-bold text-neon"
              data-testid="lobby-countdown"
              aria-live="polite"
            >
              Starting in {secondsToStart}…
            </p>
          )}
          <Button
            data-testid="lobby-ready"
            variant={iAmReady ? 'secondary' : 'primary'}
            aria-pressed={iAmReady}
            disabled={!api.online}
            onClick={() => void api.ready(!iAmReady)}
          >
            {iAmReady ? (secondsToStart !== null ? 'Cancel' : 'Ready ✓ · tap to cancel') : 'Ready'}
          </Button>
          <Button
            variant="ghost"
            data-testid="lobby-back"
            className="!min-h-10 !text-xs"
            onClick={() => void api.leave()}
          >
            Back to game selection
          </Button>
        </div>
      </div>
    </div>
  );
}
