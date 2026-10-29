import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { displayName, MODERATOR_MAX_BAN_MINUTES, TITLE_MAX } from '@pogo/shared';
import type {
  AdminAuditRow,
  AdminBanRow,
  AdminChatRow,
  AdminRoomRow,
  AdminUserRow,
  PublicUser,
  Role,
} from '@pogo/shared';
import { AvatarFace } from '../components/AvatarFace';
import { TopoBackground } from '../components/TopoBackground';
import { PlayerName } from '../components/PlayerName';
import { Button, Sheet } from '../components/ui';
import { ChatList, Chats, Matches, Overview, PlayerActivity } from './AdminViews';
import {
  adminLogin,
  adminLogout,
  adminMe,
  adminToken,
  banUser,
  kickUser,
  listAudit,
  listBans,
  listChats,
  listRooms,
  listUsers,
  recoveryLink,
  setDev,
  setRole,
  setTitles,
  unban,
} from './adminApi';

/** True on admin.<domain> and on /admin of any address. */
export const isAdminSite = () =>
  window.location.hostname.startsWith('admin.') || window.location.pathname.startsWith('/admin');

type Tab = 'overview' | 'players' | 'rooms' | 'matches' | 'chats' | 'bans' | 'log';

const field =
  'hud min-h-11 w-full bg-panel px-3 text-ink outline-none placeholder:text-muted/50 focus:!border-neon';

const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';

function Login({ onDone, note }: { onDone: (u: PublicUser) => void; note?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(note ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminLogin(email.trim(), password);
      onDone(await adminMe());
    } catch (err) {
      adminLogout();
      setError((err as Error).message);
    }
  };
  return (
    <form
      onSubmit={submit}
      className="hud mx-auto mt-24 flex max-w-sm flex-col gap-3 p-5"
      data-testid="admin-login"
    >
      <h1 className="text-xl font-bold uppercase tracking-[0.12em]">POGO admin</h1>
      <input
        className={field}
        type="email"
        placeholder="Email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="admin-email"
      />
      <input
        className={field}
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="admin-password"
      />
      {error && <p className="text-sm font-semibold text-dangertext">{error}</p>}
      <Button data-testid="admin-submit">Log in</Button>
    </form>
  );
}

function Badge({
  children,
  tone = 'plain',
}: {
  children: string;
  tone?: 'plain' | 'gold' | 'red' | 'green';
}) {
  const colors = {
    plain: 'bg-panel2 text-muted',
    gold: 'bg-neon text-accentink',
    red: 'bg-danger text-white',
    green: 'bg-lagoon text-white',
  };
  return (
    <span className={`label rounded px-1.5 py-0.5 text-[10px] ${colors[tone]}`}>{children}</span>
  );
}

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 24 * 60 },
  { label: '7 days', minutes: 7 * 24 * 60 },
  { label: '30 days', minutes: 30 * 24 * 60 },
  { label: 'Permanent', minutes: null },
];

function PlayerSheet({
  row,
  me,
  onClose,
  onChanged,
  onError,
}: {
  row: AdminUserRow | null;
  me: PublicUser;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(24 * 60);
  const [reason, setReason] = useState('');
  const [blockIp, setBlockIp] = useState(true);
  const isAdmin = me.role === 'admin';
  const durations = DURATIONS.filter(
    (d) => isAdmin || (d.minutes !== null && d.minutes <= MODERATOR_MAX_BAN_MINUTES),
  );

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      onError((err as Error).message);
    }
  };
  const sameOrHigher = row && row.role !== 'user' && (!isAdmin || row.role === 'admin');
  const [view, setView] = useState<PlayerView>('menu');
  useEffect(() => setView('menu'), [row?.id]);
  const moderatable = !!row && row.id !== me.id && !sameOrHigher;
  const entries: { id: PlayerView; label: string; hint: string }[] = [
    { id: 'matches' as const, label: 'Matches', hint: 'Their last games' },
    { id: 'chat' as const, label: 'Chat', hint: 'Their latest room messages' },
    ...(me.isDev && row && !row.isGuest
      ? [{ id: 'titles' as const, label: 'Prefix & suffix', hint: 'Text around the name' }]
      : []),
    ...(moderatable && row?.roomCode
      ? [{ id: 'kick' as const, label: 'Kick', hint: `Out of room ${row.roomCode}` }]
      : []),
    ...(moderatable ? [{ id: 'ban' as const, label: 'Ban', hint: 'For a while or for good' }] : []),
    ...(isAdmin && row?.isGuest
      ? [{ id: 'recovery' as const, label: 'Recovery link', hint: 'Log this guest in again' }]
      : []),
    ...(isAdmin && row && row.id !== me.id
      ? [{ id: 'role' as const, label: 'Role & dev tag', hint: row.role }]
      : []),
  ];
  return (
    <Sheet open={!!row} onClose={onClose} title={row ? displayName(row) : ''}>
      {row && (
        <div className="flex flex-col gap-3" data-testid="admin-player-sheet">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-2xl">
              <AvatarFace avatar={row.avatar} />
            </span>
            <div className="min-w-0">
              <div className="truncate">{row.email ?? (row.isGuest ? 'Guest' : 'Registered')}</div>
              <div className="text-xs opacity-70">
                Last seen {when(row.lastSeenAt)} · joined {when(row.createdAt)}
              </div>
            </div>
          </div>
          {row.ban && (
            <p className="rounded bg-danger/20 p-2 text-sm">
              Banned until {row.ban.expiresAt ? when(row.ban.expiresAt) : 'forever'}
              {row.ban.reason && ` · ${row.ban.reason}`}
              <button className="ml-2 underline" onClick={() => void act(() => unban(row.ban!.id))}>
                Lift ban
              </button>
            </p>
          )}
          {view === 'menu' ? (
            <div className="flex flex-col gap-2" data-testid="admin-menu">
              {row.id === me.id && <p className="text-sm opacity-70">This is you.</p>}
              {row.id !== me.id && sameOrHigher && (
                <p className="text-sm opacity-70">Staff of this rank cannot be moderated by you.</p>
              )}
              {entries.map((e) => (
                <button
                  key={e.id}
                  className="hud flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-left"
                  onClick={() => setView(e.id)}
                  data-testid={`admin-menu-${e.id}`}
                >
                  <span className="font-bold uppercase tracking-[0.1em]">{e.label}</span>
                  <span className="truncate text-xs opacity-70">{e.hint} ›</span>
                </button>
              ))}
              {entries.length === 0 && row.id !== me.id && !sameOrHigher && (
                <p className="text-sm opacity-70">Nothing to do here.</p>
              )}
            </div>
          ) : (
            <>
              <button
                className="label self-start underline"
                onClick={() => setView('menu')}
                data-testid="admin-back"
              >
                ‹ Back
              </button>
              {view === 'titles' && (
                <TitlesEditor
                  row={row}
                  onChanged={() => {
                    onChanged();
                    setView('menu');
                  }}
                  onError={onError}
                />
              )}
              {view === 'kick' && (
                <div className="hud flex flex-col gap-2 p-3">
                  <div className="label">Kick</div>
                  <p className="text-sm">
                    Remove them from room {row.roomCode}. They can join again.
                  </p>
                  <Button onClick={() => void act(() => kickUser(row.id))} data-testid="admin-kick">
                    Kick from room {row.roomCode}
                  </Button>
                </div>
              )}
              {view === 'ban' && (
                <div className="hud flex flex-col gap-2 p-3">
                  <div className="label">Ban</div>
                  <select
                    className={field}
                    value={String(minutes)}
                    onChange={(e) =>
                      setMinutes(e.target.value === 'null' ? null : Number(e.target.value))
                    }
                    data-testid="admin-ban-duration"
                  >
                    {durations.map((d) => (
                      <option key={d.label} value={String(d.minutes)}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={field}
                    placeholder="Reason (shown to the player)"
                    maxLength={200}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    data-testid="admin-ban-reason"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={blockIp}
                      onChange={(e) => setBlockIp(e.target.checked)}
                    />
                    Also block their IP address
                  </label>
                  <Button
                    className="!bg-danger"
                    onClick={() => void act(() => banUser(row.id, minutes, reason, blockIp))}
                    data-testid="admin-ban"
                  >
                    Ban
                  </Button>
                </div>
              )}
              {view === 'recovery' && <RecoveryPanel row={row} onError={onError} />}
              {(view === 'matches' || view === 'chat') && (
                <PlayerActivity userId={row.id} kind={view} onError={onError} />
              )}
              {view === 'role' && (
                <div className="hud flex flex-col gap-2 p-3">
                  <div className="label">Role & dev tag</div>
                  {!row.isGuest && (
                    <select
                      className={field}
                      value={row.role}
                      onChange={(e) => void act(() => setRole(row.id, e.target.value as Role))}
                      data-testid="admin-role"
                    >
                      <option value="user">Player</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => void act(() => setDev(row.id, !row.isDev))}
                    data-testid="admin-dev"
                  >
                    {row.isDev ? 'Remove (dev) tag' : 'Give (dev) tag'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Admin: a private login link for a guest who pressed "Switch player" (the guest's stats are kept on the server). */
function RecoveryPanel({ row, onError }: { row: AdminUserRow; onError: (m: string) => void }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  return (
    <div className="hud flex flex-col gap-2 p-3" data-testid="recovery-panel">
      <div className="label">Recovery link</div>
      <p className="text-sm">
        Send this link to {row.nickname}. Opening it on their phone logs them in as this guest again
        with all their stats. Treat it like a password.
      </p>
      {!url ? (
        <Button
          data-testid="recovery-create"
          onClick={() =>
            void recoveryLink(row.id)
              .then(setUrl)
              .catch((e: Error) => onError(e.message))
          }
        >
          Create link
        </Button>
      ) : (
        <>
          <input
            className={field}
            readOnly
            value={url}
            data-testid="recovery-url"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .catch(() => undefined)
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </>
      )}
    </div>
  );
}

type PlayerView = 'menu' | 'titles' | 'kick' | 'ban' | 'role' | 'recovery' | 'matches' | 'chat';

type Show = 'registered' | 'everyone' | 'guests';
type Sort = 'seen' | 'joined' | 'name';

function Players({ me, onError }: { me: PublicUser; onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('registered');
  const [sort, setSort] = useState<Sort>('seen');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [staffOnly, setStaffOnly] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    listUsers(q, show === 'registered')
      .then(setRows)
      .catch((e: Error) => onError(e.message));
  }, [q, show, onError]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const shown = rows
    .filter((r) => (show === 'guests' ? r.isGuest : true))
    .filter((r) => !onlineOnly || r.online)
    .filter((r) => !staffOnly || r.role !== 'user' || r.isDev)
    .sort((a, b) =>
      sort === 'name'
        ? a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' })
        : sort === 'joined'
          ? b.createdAt - a.createdAt
          : (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt),
    );
  const open = rows.find((r) => r.id === openId) ?? null;
  const chip = (active: boolean) =>
    `label rounded-[8px] border-2 px-2.5 py-1.5 ${active ? 'border-neon bg-neon text-accentink' : 'border-edge/50 bg-panel2 text-onbg'}`;
  return (
    <div className="flex flex-col gap-3">
      <input
        className={field}
        placeholder="Search nickname, email or id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="admin-search"
      />
      <div className="flex flex-wrap items-center gap-2" data-testid="admin-filters">
        {(
          [
            ['registered', 'Registered'],
            ['everyone', 'Everyone'],
            ['guests', 'Guests'],
          ] as [Show, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={chip(show === id)}
            onClick={() => setShow(id)}
            data-testid={`admin-show-${id}`}
          >
            {label}
          </button>
        ))}
        <button
          className={chip(onlineOnly)}
          onClick={() => setOnlineOnly(!onlineOnly)}
          data-testid="admin-filter-online"
        >
          Online
        </button>
        <button
          className={chip(staffOnly)}
          onClick={() => setStaffOnly(!staffOnly)}
          data-testid="admin-filter-staff"
        >
          Staff
        </button>
        <select
          className="hud min-h-9 bg-panel px-2 text-sm text-ink"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort by"
          data-testid="admin-sort"
        >
          <option value="seen">Last seen</option>
          <option value="joined">Newest</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>
      <p className="text-xs text-onbg/80" data-testid="admin-count">
        {shown.length} {shown.length === 1 ? 'player' : 'players'}
      </p>
      <ul className="flex flex-col gap-2" data-testid="admin-users">
        {shown.map((r) => (
          <li key={r.id}>
            <button
              className="hud flex w-full items-center gap-3 p-2.5 text-left"
              onClick={() => setOpenId(r.id)}
              data-testid={`admin-user-${r.nickname}`}
            >
              <span className="text-2xl">
                <AvatarFace avatar={r.avatar} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  <PlayerName name={displayName(r)} />
                </span>
                <span className="block truncate text-xs opacity-70">
                  {r.email ?? (r.isGuest ? 'guest' : 'registered')} · seen {when(r.lastSeenAt)}
                </span>
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {r.online && <Badge tone="green">online</Badge>}
                {r.roomCode && <Badge>{r.roomCode}</Badge>}
                {r.role !== 'user' && <Badge tone="gold">{r.role}</Badge>}
                {r.ban && <Badge tone="red">banned</Badge>}
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="p-4 text-center opacity-70">Nobody found</li>}
      </ul>
      <PlayerSheet
        row={open}
        me={me}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onError={onError}
      />
    </div>
  );
}

function Rooms({ onError }: { onError: (m: string) => void }) {
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  // Tap a room to read its chat (the feed filtered to that room).
  const [open, setOpen] = useState<string | null>(null);
  const [chats, setChats] = useState<AdminChatRow[] | null>(null);
  useEffect(() => {
    const load = () =>
      listRooms()
        .then(setRooms)
        .catch((e: Error) => onError(e.message));
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [onError]);
  useEffect(() => {
    setChats(null);
    if (!open) return;
    const load = () =>
      listChats({ room: open })
        .then(setChats)
        .catch((e: Error) => onError(e.message));
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [open, onError]);
  return (
    <ul className="flex flex-col gap-2" data-testid="admin-rooms">
      {rooms.map((r) => (
        <li key={r.code} className="hud p-3">
          <button
            className="block w-full text-left"
            onClick={() => setOpen(open === r.code ? null : r.code)}
            data-testid={`admin-room-${r.code}`}
          >
            <div className="flex items-center gap-2">
              <b>{r.code}</b>
              <Badge>{r.gameId}</Badge>
              <Badge>{r.status}</Badge>
              <Badge>{r.visibility}</Badge>
              <span className="flex-1" />
              <span className="text-xs opacity-70">
                {when(r.createdAt)} · {r.chatCount} messages
              </span>
            </div>
            <div className="mt-1 text-sm opacity-80">
              host {r.host}:{' '}
              {r.members
                .map((m) => `${m.nickname}${m.bot ? ' (cpu)' : ''}${m.connected ? '' : ' (away)'}`)
                .join(', ')}
              {r.spectators > 0 && ` · ${r.spectators} watching`}
            </div>
          </button>
          {open === r.code && (
            <div className="mt-2" data-testid="admin-room-chat">
              {chats === null ? <p className="label">Loading…</p> : <ChatList chats={chats} />}
            </div>
          )}
        </li>
      ))}
      {rooms.length === 0 && <li className="p-4 text-center opacity-70">No rooms right now</li>}
    </ul>
  );
}

function Bans({ onError }: { onError: (m: string) => void }) {
  const [bans, setBans] = useState<AdminBanRow[]>([]);
  const load = useCallback(() => {
    listBans()
      .then(setBans)
      .catch((e: Error) => onError(e.message));
  }, [onError]);
  useEffect(load, [load]);
  return (
    <ul className="flex flex-col gap-2" data-testid="admin-bans">
      {bans.map((b) => (
        <li key={b.id} className="hud flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{b.nickname}</div>
            <div className="text-xs opacity-80">
              until {b.expiresAt ? when(b.expiresAt) : 'forever'} · by {b.byName}
              {b.ip && ' · IP blocked'}
              {b.reason && ` · ${b.reason}`}
            </div>
          </div>
          <Button
            variant="secondary"
            className="!min-h-10 !px-3"
            onClick={() =>
              void unban(b.id)
                .then(load)
                .catch((e: Error) => onError(e.message))
            }
          >
            Lift
          </Button>
        </li>
      ))}
      {bans.length === 0 && <li className="p-4 text-center opacity-70">No active bans</li>}
    </ul>
  );
}

function Log({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  useEffect(() => {
    listAudit()
      .then(setRows)
      .catch((e: Error) => onError(e.message));
  }, [onError]);
  return (
    <ul className="flex flex-col gap-1.5 text-sm" data-testid="admin-log">
      {rows.map((r) => (
        <li key={r.id} className="hud px-3 py-2">
          <b>{r.actorName}</b> {r.action.replace(/-/g, ' ')} {r.targetName && <b>{r.targetName}</b>}
          {r.detail && <span className="opacity-80"> · {r.detail}</span>}
          <div className="text-xs opacity-60">{when(r.at)}</div>
        </li>
      ))}
      {rows.length === 0 && <li className="p-4 text-center opacity-70">Nothing yet</li>}
    </ul>
  );
}

/** Ideas the developer can tap instead of typing. */
const PREFIX_IDEAS = ['👑', '⭐', '💎', '🔥', 'Sir', 'Lady', 'Dr.', 'VIP'];
const SUFFIX_IDEAS = ['🐸', '🎲', '🃏', '💫', 'the Great', 'Pro', 'MVP', '♥'];

/** Developers only: the prefix and suffix around a registered player's name. */
function TitlesEditor({
  row,
  onChanged,
  onError,
}: {
  row: AdminUserRow;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [prefix, setPrefix] = useState(row.prefix);
  const [suffix, setSuffix] = useState(row.suffix);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPrefix(row.prefix);
    setSuffix(row.suffix);
  }, [row.id, row.prefix, row.suffix]);
  const save = (p: string, s: string) => {
    setBusy(true);
    setTitles(row.id, p, s)
      .then(onChanged)
      .catch((e: Error) => onError(e.message))
      .finally(() => setBusy(false));
  };
  const chips = (ideas: string[], set: (v: string) => void, testPrefix: string) => (
    <div className="flex flex-wrap gap-1.5">
      {ideas.map((i) => (
        <button
          key={i}
          type="button"
          className="hud px-2 py-1 text-sm"
          onClick={() => set(i)}
          data-testid={`${testPrefix}-${i}`}
        >
          {i}
        </button>
      ))}
    </div>
  );
  return (
    <div className="hud flex flex-col gap-2 p-3" data-testid="title-editor">
      <div className="label">Prefix and suffix</div>
      <p className="hud px-3 py-2 text-lg font-bold" data-testid="title-preview">
        <PlayerName name={displayName({ ...row, prefix: prefix.trim(), suffix: suffix.trim() })} />
      </p>
      <input
        className={field}
        placeholder="Prefix (before the name)"
        value={prefix}
        maxLength={TITLE_MAX * 2}
        onChange={(e) => setPrefix(e.target.value)}
        data-testid="title-prefix"
      />
      {chips(PREFIX_IDEAS, setPrefix, 'idea-prefix')}
      <input
        className={field}
        placeholder="Suffix (after the name)"
        value={suffix}
        maxLength={TITLE_MAX * 2}
        onChange={(e) => setSuffix(e.target.value)}
        data-testid="title-suffix"
      />
      {chips(SUFFIX_IDEAS, setSuffix, 'idea-suffix')}
      <p className="text-xs opacity-70">
        At most {TITLE_MAX} characters each. Others see it when they next join a room.
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => save(prefix.trim(), suffix.trim())}
          data-testid="title-save"
        >
          Save
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => {
            setPrefix('');
            setSuffix('');
            save('', '');
          }}
          data-testid="title-clear"
        >
          Remove both
        </Button>
      </div>
    </div>
  );
}

export function AdminApp() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [checking, setChecking] = useState(!!adminToken());
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const showError = useCallback((m: string) => setError(m), []);

  useEffect(() => {
    document.title = 'POGO admin';
    if (!adminToken()) return;
    adminMe()
      .then(setMe)
      .catch(() => adminLogout())
      .finally(() => setChecking(false));
  }, []);

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['players', 'Players'],
    ['rooms', 'Rooms'],
    ['matches', 'Matches'],
    ['chats', 'Chats'],
    ['bans', 'Bans'],
    ['log', 'Log'],
  ];
  return (
    <div className="menu min-h-dvh px-4 pb-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <TopoBackground />
      {checking ? (
        <p className="label p-8 text-center text-onbg">Loading…</p>
      ) : !me ? (
        <Login onDone={setMe} />
      ) : (
        <div className="mx-auto max-w-3xl" data-testid="admin-panel">
          <header className="mb-4 flex items-center gap-3">
            <h1 className="flex-1 text-xl font-bold uppercase tracking-[0.12em] text-onbg">
              POGO admin
            </h1>
            <span className="label text-onbg/80">
              {displayName(me)} · {me.role}
            </span>
            <button
              className="label text-onbg underline"
              onClick={() => {
                adminLogout();
                setMe(null);
              }}
            >
              Log out
            </button>
          </header>
          <nav className="mb-4 flex flex-wrap gap-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                data-testid={`admin-tab-${id}`}
                onClick={() => setTab(id)}
                className={`label min-w-[5.5rem] flex-1 rounded-[8px] border-2 px-3 py-2 ${tab === id ? 'border-neon bg-neon text-accentink' : 'border-edge/50 bg-panel2 text-onbg'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {error && (
            <p
              className="mb-3 rounded bg-danger/80 p-2 text-sm font-semibold text-white"
              role="alert"
              onClick={() => setError('')}
            >
              {error}
            </p>
          )}
          {tab === 'overview' && <Overview onError={showError} />}
          {tab === 'players' && <Players me={me} onError={showError} />}
          {tab === 'rooms' && <Rooms onError={showError} />}
          {tab === 'matches' && <Matches onError={showError} />}
          {tab === 'chats' && <Chats onError={showError} />}
          {tab === 'bans' && <Bans onError={showError} />}
          {tab === 'log' && <Log onError={showError} />}
        </div>
      )}
    </div>
  );
}
