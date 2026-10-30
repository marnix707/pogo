import { useState } from 'react';
import type { AdminChatRow, AdminMatchRow, AdminOverview } from '@pogo/shared';
import { AvatarFace } from '../components/AvatarFace';
import { PlayerName } from '../components/PlayerName';
import { gameUis, getGameUi } from '../games/registry';
import { useLive } from './useLive';
import { getOverview, listChats, listMatches, listUserMatches } from './adminApi';

const when = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const gameName = (id: string) => getGameUi(id)?.name ?? id;

const Stat = ({ label, value, hint }: { label: string; value: number | string; hint?: string }) => (
  <div className="hud px-3 py-2 text-center">
    <div className="text-2xl font-bold tabular-nums">{value}</div>
    <div className="label text-[10px] opacity-80">{label}</div>
    {hint && <div className="text-[10px] opacity-60">{hint}</div>}
  </div>
);

/** The first tab: how busy it is right now and the matches of today / this week per game. */
export function Overview({ onError }: { onError: (m: string) => void }) {
  const o: AdminOverview | null = useLive(getOverview, onError, 5000, []);
  if (!o) return <p className="label p-4 text-center">Loading…</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="admin-overview">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Online now" value={o.online} />
        <Stat
          label="Rooms"
          value={o.rooms.total}
          hint={`${o.rooms.lobby} lobby · ${o.rooms.playing} playing`}
        />
        <Stat label="Registered" value={o.players.registered} hint={`${o.players.guests} guests`} />
        <Stat label="Games (24 h)" value={o.matches.today} hint={`${o.matches.week} this week`} />
      </div>
      <section>
        <h2 className="label mb-1">Games played per title</h2>
        <ul className="flex flex-col gap-1.5" data-testid="admin-by-game">
          {o.byGame.length === 0 && <li className="p-3 text-center opacity-70">No games yet</li>}
          {o.byGame.map((g) => (
            <li key={g.gameId} className="hud flex items-center gap-3 px-3 py-2">
              <b className="flex-1">{gameName(g.gameId)}</b>
              <span className="text-sm opacity-80">{g.today} today</span>
              <span className="w-24 text-right text-sm tabular-nums">{g.week} this week</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** A list of finished games: when, which game, who played (rank, score) and the game's own facts. */
export function MatchList({ matches }: { matches: AdminMatchRow[] }) {
  if (matches.length === 0) return <p className="p-4 text-center opacity-70">No games</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="admin-matches">
      {matches.map((m) => {
        const ui = getGameUi(m.gameId);
        const score = ui?.scoreText ?? ((n: number) => String(n));
        return (
          <li key={m.matchId} className="hud p-3" data-testid="admin-match">
            <div className="flex items-center gap-2">
              <b>{gameName(m.gameId)}</b>
              <span className="flex-1" />
              <span className="text-xs opacity-70">{when(m.playedAt)}</span>
              <span className="text-xs opacity-50">{m.matchId}</span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {m.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs opacity-70">{p.rank}</span>
                  <span className="text-lg">
                    <AvatarFace avatar={p.avatar} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <PlayerName name={p.nickname} />
                    {p.bot && ' (cpu)'}
                  </span>
                  <b className="tabular-nums">{score(p.score)}</b>
                </li>
              ))}
            </ul>
            {m.detail && (
              <details className="mt-1 text-xs opacity-80">
                <summary className="cursor-pointer">Game details</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-black/20 p-2">
                  {JSON.stringify(m.detail, null, 1)}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The Matches tab: the latest finished games of everybody, one game at a time if wanted. */
export function Matches({ onError }: { onError: (m: string) => void }) {
  const [game, setGame] = useState('');
  const matches = useLive(() => listMatches(game || undefined), onError, 10000, [game]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" data-testid="admin-match-games">
        {[{ id: '', name: 'All' }, ...gameUis].map((g) => (
          <button
            key={g.id}
            aria-pressed={game === g.id}
            onClick={() => setGame(g.id)}
            className={`label min-h-9 rounded-md border-2 px-3 ${game === g.id ? 'border-neon bg-neon text-accentink' : 'border-edge/50 text-onbg'}`}
          >
            {g.name}
          </button>
        ))}
      </div>
      {matches === null ? (
        <p className="label p-4 text-center">Loading…</p>
      ) : (
        <MatchList matches={matches} />
      )}
    </div>
  );
}

/** Room chat messages, newest first. */
export function ChatList({ chats }: { chats: AdminChatRow[] }) {
  if (chats.length === 0) return <p className="p-4 text-center opacity-70">No messages</p>;
  return (
    <ul className="flex flex-col gap-1.5" data-testid="admin-chats">
      {chats.map((c) => (
        <li key={c.id} className="hud px-3 py-1.5 text-sm" data-testid="admin-chat">
          <div className="flex items-center gap-2 text-xs opacity-80">
            <b className="text-sm">
              <PlayerName name={c.nickname} />
            </b>
            <span className="rounded bg-black/20 px-1.5">{c.roomCode}</span>
            <span>{gameName(c.gameId)}</span>
            <span className="flex-1" />
            <span>{new Date(c.at).toLocaleTimeString('en-GB')}</span>
          </div>
          <div className="break-words">{c.text}</div>
        </li>
      ))}
    </ul>
  );
}

/** The Chats tab: the latest 500 messages of all rooms, searchable by word, room code or player name. */
export function Chats({ onError }: { onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [room, setRoom] = useState('');
  const chats = useLive(() => listChats({ q, room }), onError, 4000, [q, room]);
  const field =
    'hud min-h-10 min-w-0 flex-1 bg-panel px-3 text-ink outline-none placeholder:text-muted/50 focus:!border-neon';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className={field}
          placeholder="Search words or names"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="admin-chat-search"
        />
        <input
          className={`${field} !flex-none !w-28 uppercase`}
          placeholder="Room"
          maxLength={8}
          value={room}
          onChange={(e) => setRoom(e.target.value.toUpperCase())}
        />
      </div>
      {chats === null ? (
        <p className="label p-4 text-center">Loading…</p>
      ) : (
        <ChatList chats={chats} />
      )}
      <p className="text-xs opacity-60">
        The feed keeps the latest 500 room messages (memory only: it is empty after a restart).
        Private messages are never shown here.
      </p>
    </div>
  );
}

/** One player's last games and last room messages (in the player sheet). */
export function PlayerActivity({
  userId,
  kind,
  onError,
}: {
  userId: string;
  kind: 'matches' | 'chat';
  onError: (m: string) => void;
}) {
  const matches = useLive(
    () => (kind === 'matches' ? listUserMatches(userId) : Promise.resolve([])),
    onError,
    0,
    [userId, kind],
  );
  const chats = useLive(
    () => (kind === 'chat' ? listChats({ user: userId }) : Promise.resolve([])),
    onError,
    0,
    [userId, kind],
  );
  if (kind === 'matches')
    return matches === null ? <p className="label">Loading…</p> : <MatchList matches={matches} />;
  return chats === null ? <p className="label">Loading…</p> : <ChatList chats={chats} />;
}
