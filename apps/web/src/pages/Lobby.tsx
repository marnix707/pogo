import { PlayerName } from '../components/PlayerName';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOT_AVATAR, BOT_NAMES, getGame } from '@pogo/shared';
import type { ChatMessage, PublicRoomSummary, RoomView } from '@pogo/shared';
import { ChevronIcon, CrownIcon, LockIcon, SlidersIcon } from '../components/icons';
import { ChatPanel } from '../components/ChatPanel';
import { GameCard } from '../components/GameCard';
import { JoinBar, PlayScreen } from '../components/PlayScreen';
import { Avatar, Button, Card, SectionLabel, Toggle } from '../components/ui';
import { TileButton } from '../components/TopBar';
import { useToast } from '../components/Toast';
import { getGameUi } from '../games/registry';
import { morphFrom, takeGameCardRect } from '../lib/cardMorph';
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
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Shown but greyed out (only the host changes it). */
  disabled?: boolean;
}) {
  const btn =
    'flex h-12 w-12 items-center justify-center rounded-md border-2 border-neon text-2xl font-bold text-neon disabled:border-edge/30 disabled:text-muted/40';
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        <button
          className={btn}
          aria-label={`Fewer ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span className="w-6 text-center text-xl font-bold tabular-nums">{value}</span>
        <button
          className={btn}
          aria-label={`More ${label}`}
          disabled={disabled || value >= max}
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
  lobbyList,
  watchLobby,
}: {
  room: RoomView;
  me: string;
  api: RoomApi;
  messages: ChatMessage[];
  markRead: () => void;
  onSettings: () => void;
  /** The open public games (for the game list the host sees after tapping the game card). */
  lobbyList: PublicRoomSummary[] | null;
  watchLobby: () => () => void;
}) {
  const toast = useToast();
  const isHost = room.hostId === me;
  /** The host opened the list of games (the top card is a button): the settings make room for it. */
  const [choosing, setChoosing] = useState(false);
  /** The settings are folded by default; the host unfolds them to change something. */
  const [settingsFold, setSettingsFold] = useState(false);
  useEffect(() => setSettingsFold(false), [room.gameId]); // a new game: folded again
  // Arriving from the Play screen: the tapped game card morphs to the top of this lobby.
  const topCard = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const from = takeGameCardRect();
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (from && topCard.current && !reduced) morphFrom(topCard.current, from);
  }, []);
  // The host switched the game under us: tell the others (the lobby stays, only the game changes).
  const shownGame = useRef(room.gameId);
  useEffect(() => {
    if (shownGame.current === room.gameId) return;
    shownGame.current = room.gameId;
    if (!isHost) toast.show(`The host switched to ${room.gameName}`, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.gameId]);
  const iAmReady = !!room.members.find((m) => m.id === me)?.ready;
  const iAmLocked = !!room.members.find((m) => m.id === me)?.readyLock;
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
        {choosing ? (
          /* Picking a game: the join-by-code bar takes the place of the lobby bar (it comes back afterwards). */
          <JoinBar api={api} />
        ) : (
          <>
            {/* The bar above the game card: Invite and the lobby code on the left, then Public / Private and the settings button. */}
            <Card className="hud-ticks !p-2">
              <div className="flex items-center gap-2" data-testid="lobby-toolbar">
                <Button
                  variant="secondary"
                  aria-label="Invite friends"
                  className="min-h-10 shrink-0 !px-3"
                  onClick={() => void share()}
                >
                  Invite
                </Button>
                {/* A public lobby shows its code next to Invite. */}
                {room.visibility === 'public' && (
                  <span className="label min-w-0 truncate text-[10px] text-muted">
                    Lobby code:{' '}
                    <span
                      data-testid="room-code"
                      className="select-all text-sm font-bold leading-none tracking-[0.1em] text-neon max-[380px]:text-xs max-[380px]:tracking-normal"
                    >
                      {room.code}
                    </span>
                  </span>
                )}
                <span className="flex-1" />
                <span
                  data-testid="room-visibility"
                  className={`label shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                    room.visibility === 'public'
                      ? 'border-accent text-accent'
                      : 'border-edge/50 text-muted'
                  }`}
                >
                  {room.visibility === 'public' ? 'Public' : 'Private'}
                </span>
                <TileButton
                  onClick={onSettings}
                  aria-label="Settings"
                  data-testid="settings-button"
                >
                  <SlidersIcon className="h-5 w-5" />
                </TileButton>
              </div>
            </Card>
          </>
        )}

        {/* The game card from the Play screen, now the top of the lobby. The host taps it to pick another
            game (everybody stays in the room); the rest of the lobby drops in underneath it. */}
        {ui && (
          <GameCard
            ref={topCard}
            ui={ui}
            data-testid="lobby-game-card"
            chevron={isHost ? (choosing ? 'up' : 'down') : undefined}
            onClick={isHost ? () => setChoosing((c) => !c) : undefined}
          />
        )}

        {choosing ? (
          /* The very same screen as after Play: join with a code on top, the games, the open games below. */
          <div className="lobby-stack flex flex-col gap-5" data-testid="game-list">
            <PlayScreen
              api={api}
              lobby={lobbyList}
              watchLobby={watchLobby}
              currentId={room.gameId}
              gameIdPrefix="pick-game"
              showJoin={false}
              // All the way at the bottom: leave the lobby for the home screen (no intro animation again).
              onMainScreen={() => void api.leave()}
              tooBigFor={(id) => room.members.length > (getGame(id)?.maxPlayers ?? Infinity)}
              onPick={(g) => {
                if (g.id === room.gameId) {
                  setChoosing(false);
                  return;
                }
                setChoosing(false);
                return api.setGame(g.id);
              }}
            />
          </div>
        ) : (
          <div className="lobby-stack flex flex-col gap-5">
            {/* The settings fold in and out (folded by default: a new lobby, a new game, a new visit). */}
            <section aria-label="Lobby settings">
              <button
                type="button"
                className="w-full text-left"
                aria-expanded={settingsFold}
                data-testid="lobby-settings-toggle"
                onClick={() => setSettingsFold((f) => !f)}
              >
                <SectionLabel
                  right={
                    <ChevronIcon
                      className="h-5 w-5 transition-transform duration-300"
                      style={{ transform: settingsFold ? 'rotate(180deg)' : 'none' }}
                    />
                  }
                >
                  Settings
                </SectionLabel>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{
                  gridTemplateRows: settingsFold ? '1fr' : '0fr',
                  // Hidden (not just clipped) while folded, so nothing in it can be tabbed to or tapped.
                  visibility: settingsFold ? 'visible' : 'hidden',
                  transitionProperty: 'grid-template-rows, visibility',
                  transitionDuration: '300ms, 0s',
                  transitionDelay: settingsFold ? '0s, 0s' : '0s, 300ms',
                }}
                data-testid="lobby-settings"
                data-open={settingsFold}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex flex-col gap-5 pb-1">
                    {/* Block 1: the game mode (when the game has one) with the turn timer underneath. */}
                    {(ui?.LobbyOptions || limits) && (
                      <section aria-label="Game settings">
                        {ui?.LobbyOptions && <SectionLabel>Game mode</SectionLabel>}
                        <Card className="flex flex-col gap-5">
                          {ui?.LobbyOptions && (
                            <ui.LobbyOptions
                              room={room}
                              isHost={isHost}
                              setOptions={(options) => void api.updateSettings({ options })}
                            />
                          )}
                          {limits && (
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 font-semibold">Turn timer</div>
                              <div
                                className="grid flex-1 grid-cols-4 gap-1.5"
                                data-testid="turn-timer"
                              >
                                {TIMER_CHOICES.map((t) => (
                                  <button
                                    key={t.value}
                                    aria-pressed={room.turnTimeSec === t.value}
                                    disabled={!isHost}
                                    onClick={() =>
                                      void api.updateSettings({ turnTimeSec: t.value })
                                    }
                                    className={`min-h-11 rounded-md border-2 px-0 text-sm font-bold disabled:opacity-50 ${
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
                    {limits && (
                      <section aria-label="Visibility">
                        <Card>
                          <Toggle
                            label="Public room"
                            disabled={!isHost}
                            checked={room.visibility === 'public'}
                            onChange={(isPublic) =>
                              void api.updateSettings({
                                visibility: isPublic ? 'public' : 'private',
                              })
                            }
                          />
                        </Card>
                      </section>
                    )}

                    {/* Block 3: computer players. The table size is simply the game's maximum. */}
                    {limits?.supportsBots && (
                      <section aria-label="Computer players">
                        <Card>
                          <Stepper
                            label="Computer players"
                            disabled={!isHost}
                            value={room.bots}
                            min={0}
                            max={limits.maxPlayers - room.members.length}
                            onChange={(bots) => void api.updateSettings({ bots })}
                          />
                        </Card>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </section>

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
                        <PlayerName name={m.nickname} />
                        {m.id === me && <span className="font-normal text-muted"> (you)</span>}
                      </div>
                      <div className="label flex items-center gap-1.5 text-[10px] text-muted">
                        {m.id === room.hostId && (
                          <>
                            <CrownIcon className="h-3.5 w-3.5 text-accent" /> Host ·
                          </>
                        )}
                        {!m.connected
                          ? 'Reconnecting…'
                          : m.ready
                            ? m.readyLock
                              ? 'Ready 🔒'
                              : 'Ready ✓'
                            : 'Not ready'}
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
          </div>
        )}
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
          <div className="flex gap-2">
            <Button
              className="min-w-0 flex-1 whitespace-nowrap"
              data-testid="lobby-ready"
              variant={iAmReady ? 'secondary' : 'primary'}
              aria-pressed={iAmReady}
              disabled={!api.online}
              onClick={() => void api.ready(!iAmReady)}
            >
              {/* The ready count lives inside the button: "Ready 1/3", then the countdown. */}
              {iAmReady && <span aria-hidden>✓ </span>}
              <span data-testid="lobby-ready-count">
                Ready {readyCount}/{room.members.length}
              </span>
              {secondsToStart !== null && (
                <span data-testid="lobby-countdown" aria-live="polite">
                  {' · '}Starting {secondsToStart}…
                </span>
              )}
            </Button>
            {/* Once ready: an open padlock. Tap it to lock Ready (it then survives setting changes, a switched
                game and coming back from a game); tap again to unlock. Cancelling Ready unlocks it too. */}
            {iAmReady && (
              <button
                type="button"
                data-testid="lobby-ready-lock"
                aria-pressed={iAmLocked}
                aria-label={iAmLocked ? 'Unlock ready' : 'Lock ready'}
                disabled={!api.online}
                onClick={() => void api.readyLock(!iAmLocked)}
                className={`flex min-h-12 w-14 shrink-0 items-center justify-center rounded-[8px] border-2 ring-2 ring-line ${
                  iAmLocked
                    ? 'border-neon bg-neon text-accentink'
                    : 'border-neon/70 bg-panel2 text-neon'
                }`}
              >
                <LockIcon open={!iAmLocked} className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
