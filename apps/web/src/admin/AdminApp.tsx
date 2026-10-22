import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { displayName, MODERATOR_MAX_BAN_MINUTES, TITLE_MAX } from '@pogo/shared';
import type {
  AdminAuditRow,
  AdminBanRow,
  AdminRoomRow,
  AdminUserRow,
  PublicUser,
  Role,
  TitleUserRow,
} from '@pogo/shared';
import { AvatarFace } from '../components/AvatarFace';
import { TopoBackground } from '../components/TopoBackground';
import { PlayerName } from '../components/PlayerName';
import { Button, Sheet } from '../components/ui';
import {
  adminLogin,
  adminLogout,
  adminMe,
  adminToken,
  banUser,
  kickUser,
  listAudit,
  listBans,
  listRooms,
  listTitleUsers,
  listUsers,
  setDev,
  setRole,
  setTitles,
  unban,
} from './adminApi';

/** True on admin.<domain> and on /admin of any address. */
export const isAdminSite = () =>
  window.location.hostname.startsWith('admin.') || window.location.pathname.startsWith('/admin');

type Tab = 'players' | 'titles' | 'rooms' | 'bans' | 'log';

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
          {row.id === me.id ? (
            <p className="text-sm opacity-70">This is you.</p>
          ) : sameOrHigher ? (
            <p className="text-sm opacity-70">Staff of this rank cannot be moderated by you.</p>
          ) : (
            <>
              {row.roomCode && (
                <Button
                  variant="secondary"
                  onClick={() => void act(() => kickUser(row.id))}
                  data-testid="admin-kick"
                >
                  Kick from room {row.roomCode}
                </Button>
              )}
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
            </>
          )}
          {isAdmin && row.id !== me.id && (
            <div className="hud flex flex-col gap-2 p-3">
              <div className="label">Admin</div>
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
        </div>
      )}
    </Sheet>
  );
}

function Players({ me, onError }: { me: PublicUser; onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [open, setOpen] = useState<AdminUserRow | null>(null);
  const load = useCallback(() => {
    listUsers(q)
      .then(setRows)
      .catch((e: Error) => onError(e.message));
  }, [q, onError]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div className="flex flex-col gap-3">
      <input
        className={field}
        placeholder="Search nickname, email or id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="admin-search"
      />
      <ul className="flex flex-col gap-2" data-testid="admin-users">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              className="hud flex w-full items-center gap-3 p-2.5 text-left"
              onClick={() => setOpen(r)}
              data-testid={`admin-user-${r.nickname}`}
            >
              <span className="text-2xl">
                <AvatarFace avatar={r.avatar} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{displayName(r)}</span>
                <span className="block truncate text-xs opacity-70">
                  {r.email ?? (r.isGuest ? 'guest' : 'registered')}
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
        {rows.length === 0 && <li className="p-4 text-center opacity-70">Nobody found</li>}
      </ul>
      <PlayerSheet
        row={open}
        me={me}
        onClose={() => setOpen(null)}
        onChanged={load}
        onError={onError}
      />
    </div>
  );
}

function Rooms({ onError }: { onError: (m: string) => void }) {
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  useEffect(() => {
    const load = () =>
      listRooms()
        .then(setRooms)
        .catch((e: Error) => onError(e.message));
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [onError]);
  return (
    <ul className="flex flex-col gap-2" data-testid="admin-rooms">
      {rooms.map((r) => (
        <li key={r.code} className="hud p-3">
          <div className="flex items-center gap-2">
            <b>{r.code}</b>
            <Badge>{r.gameId}</Badge>
            <Badge>{r.status}</Badge>
            <Badge>{r.visibility}</Badge>
          </div>
          <div className="mt-1 text-sm opacity-80">
            {r.members.map((m) => `${m.nickname}${m.bot ? ' (cpu)' : ''}`).join(', ')}
          </div>
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
          <b>{r.actorName}</b> {r.action} {r.targetName && <b>{r.targetName}</b>}
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

function TitleSheet({
  row,
  onClose,
  onChanged,
  onError,
}: {
  row: TitleUserRow | null;
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPrefix(row?.prefix ?? '');
    setSuffix(row?.suffix ?? '');
  }, [row]);
  const save = (p: string, s: string) => {
    if (!row) return;
    setBusy(true);
    setTitles(row.id, p, s)
      .then(() => {
        onChanged();
        onClose();
      })
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
    <Sheet open={!!row} onClose={onClose} title={row ? row.nickname : ''}>
      {row && (
        <div className="flex flex-col gap-3" data-testid="title-sheet">
          <p className="label">Preview</p>
          <p className="hud px-3 py-2 text-lg font-bold" data-testid="title-preview">
            <PlayerName
              name={displayName({ ...row, prefix: prefix.trim(), suffix: suffix.trim() })}
            />
          </p>
          <label className="flex flex-col gap-1">
            <span className="label">Prefix (before the name)</span>
            <input
              className={field}
              value={prefix}
              maxLength={TITLE_MAX * 2}
              onChange={(e) => setPrefix(e.target.value)}
              data-testid="title-prefix"
            />
          </label>
          {chips(PREFIX_IDEAS, setPrefix, 'idea-prefix')}
          <label className="flex flex-col gap-1">
            <span className="label">Suffix (after the name)</span>
            <input
              className={field}
              value={suffix}
              maxLength={TITLE_MAX * 2}
              onChange={(e) => setSuffix(e.target.value)}
              data-testid="title-suffix"
            />
          </label>
          {chips(SUFFIX_IDEAS, setSuffix, 'idea-suffix')}
          <p className="text-xs opacity-70">
            At most {TITLE_MAX} characters each. Everybody sees it from the next room they join.
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
              onClick={() => save('', '')}
              data-testid="title-clear"
            >
              Remove both
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Developers only: every registered player, and the prefix / suffix they were given. */
function Titles({ onError }: { onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TitleUserRow[]>([]);
  const [open, setOpen] = useState<TitleUserRow | null>(null);
  const load = useCallback(() => {
    listTitleUsers(q)
      .then(setRows)
      .catch((e: Error) => onError(e.message));
  }, [q, onError]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div className="flex flex-col gap-3">
      <input
        className={field}
        placeholder="Search nickname or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="titles-search"
      />
      <ul className="flex flex-col gap-2" data-testid="titles-users">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              className="hud flex w-full items-center gap-3 p-2.5 text-left"
              onClick={() => setOpen(r)}
              data-testid={`titles-user-${r.nickname}`}
            >
              <span className="text-2xl">
                <AvatarFace avatar={r.avatar} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  <PlayerName name={displayName(r)} />
                </span>
                <span className="block truncate text-xs opacity-70">{r.email}</span>
              </span>
              {r.online && <Badge tone="green">online</Badge>}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-4 text-center opacity-70">No registered players found</li>
        )}
      </ul>
      <TitleSheet row={open} onClose={() => setOpen(null)} onChanged={load} onError={onError} />
    </div>
  );
}

export function AdminApp() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [checking, setChecking] = useState(!!adminToken());
  const [tab, setTab] = useState<Tab>('players');
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
    ['players', 'Players'],
    ...(me?.isDev ? ([['titles', 'Titles']] as [Tab, string][]) : []),
    ['rooms', 'Rooms'],
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
          <nav className="mb-4 flex gap-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                data-testid={`admin-tab-${id}`}
                onClick={() => setTab(id)}
                className={`label flex-1 rounded-[8px] border-2 px-3 py-2 ${tab === id ? 'border-neon bg-neon text-accentink' : 'border-edge/50 bg-panel2 text-onbg'}`}
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
          {tab === 'players' && <Players me={me} onError={showError} />}
          {tab === 'titles' && me.isDev && <Titles onError={showError} />}
          {tab === 'rooms' && <Rooms onError={showError} />}
          {tab === 'bans' && <Bans onError={showError} />}
          {tab === 'log' && <Log onError={showError} />}
        </div>
      )}
    </div>
  );
}
