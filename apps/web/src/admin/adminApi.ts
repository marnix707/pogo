import { formatError } from '@pogo/shared';
import type {
  AdminAuditRow,
  AdminBanRow,
  AdminChatRow,
  AdminMatchRow,
  AdminOverview,
  AdminRoomRow,
  AdminUserRow,
  AuthResponse,
  PublicUser,
  Role,
} from '@pogo/shared';

// The panel has its own token: on admin.<domain> the storage is separate anyway, and on /admin of the
// game's own address it must not log the admin out of the game (or the other way round).
const KEY = 'pogo.admin.token';

export const adminToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the panel just asks again after a reload */
  }
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = adminToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    ref?: string;
  };
  if (!res.ok)
    throw new Error(
      formatError(json.error ?? `Request failed (${res.status})`, json.code, json.ref),
    );
  return json;
}

export async function adminLogin(email: string, password: string): Promise<PublicUser> {
  const auth = await call<AuthResponse>('POST', '/api/auth/login', { email, password });
  setToken(auth.token);
  return auth.user;
}
export const adminLogout = () => setToken(null);
export const adminMe = () => call<{ user: PublicUser }>('GET', '/api/admin/me').then((r) => r.user);

export const listUsers = (q: string, registeredOnly: boolean) =>
  call<{ users: AdminUserRow[] }>(
    'GET',
    `/api/admin/users?q=${encodeURIComponent(q)}${registeredOnly ? '&registered=1' : ''}`,
  ).then((r) => r.users);
export const listRooms = () =>
  call<{ rooms: AdminRoomRow[] }>('GET', '/api/admin/rooms').then((r) => r.rooms);
export const listBans = () =>
  call<{ bans: AdminBanRow[] }>('GET', '/api/admin/bans').then((r) => r.bans);
export const listAudit = () =>
  call<{ audit: AdminAuditRow[] }>('GET', '/api/admin/audit').then((r) => r.audit);

export const kickUser = (id: string) => call('POST', `/api/admin/users/${id}/kick`, {});
export const banUser = (id: string, minutes: number | null, reason: string, blockIp: boolean) =>
  call('POST', `/api/admin/users/${id}/ban`, { minutes, reason, blockIp });
export const unban = (banId: string) => call('DELETE', `/api/admin/bans/${banId}`);
export const setRole = (id: string, role: Role) =>
  call('POST', `/api/admin/users/${id}/role`, { role });
export const setDev = (id: string, isDev: boolean) =>
  call('POST', `/api/admin/users/${id}/dev`, { isDev });

/** A login link for a guest who lost their device token. `url` is null when the server has no public address. */
export const recoveryLink = (id: string) =>
  call<{ token: string; url: string | null }>('POST', `/api/admin/users/${id}/recovery`, {}).then(
    (r) => r.url ?? `${window.location.origin}/?recover=${encodeURIComponent(r.token)}`,
  );

export const setTitles = (id: string, prefix: string, suffix: string) =>
  call('POST', `/api/admin/users/${id}/titles`, { prefix, suffix });

export const getOverview = () => call<AdminOverview>('GET', '/api/admin/overview');
/** The latest finished games of everybody, optionally one game. */
export const listMatches = (game?: string) =>
  call<{ matches: AdminMatchRow[] }>(
    'GET',
    `/api/admin/matches${game ? `?game=${encodeURIComponent(game)}` : ''}`,
  ).then((r) => r.matches);
/** One player's last games. */
export const listUserMatches = (userId: string) =>
  call<{ matches: AdminMatchRow[] }>(
    'GET',
    `/api/admin/matches?user=${encodeURIComponent(userId)}`,
  ).then((r) => r.matches);
/** The room chat feed (the latest 500 messages of all rooms), optionally one room / player / word. */
export const listChats = (filter: { room?: string; user?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
  return call<{ chats: AdminChatRow[] }>('GET', `/api/admin/chats?${params.toString()}`).then(
    (r) => r.chats,
  );
};
