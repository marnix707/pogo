import type { AuthResponse, GameStatsView, LeaderboardRow, ProfileInput } from '@pogo/shared';
import { formatError } from '@pogo/shared';
import { forgetPlayer, rememberPlayer } from './players';

/** An error body from the API: the text, its error code and (for server errors) a log reference. */
interface ApiErrorBody {
  error?: string;
  code?: string;
  ref?: string;
}
/** "Room not found (ROOM-101)": the friendly text with the code behind it, for troubleshooting. */
const apiError = (body: ApiErrorBody, fallback: string): string =>
  formatError(body.error ?? fallback, body.code, body.ref);
const errorBody = async (res: Response): Promise<ApiErrorBody> =>
  (await res.json().catch(() => ({}))) as ApiErrorBody;

const TOKEN_KEY = 'pogo.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Opens the admin panel (`/admin`) signed in as the current player: the panel keeps its own token key,
 * so the game's token is handed over first (it is the same account, the server checks the dev/staff rights).
 */
export function openAdminPanel() {
  const token = readToken();
  try {
    if (token) localStorage.setItem('pogo.admin.token', token);
  } catch {
    /* the panel then simply asks for a login */
  }
  window.location.assign('/admin');
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session just won't survive a refresh.
  }
}

/** Re-use the stored guest identity if the server still accepts it. */
export async function restoreSession(): Promise<AuthResponse | null> {
  const token = readToken();
  if (!token) return null;
  const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    writeToken(null);
    return null;
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(apiError(body, 'You are banned.'));
  }
  if (!res.ok) throw new Error(apiError(await errorBody(res), 'Could not reach the server'));
  const { user } = (await res.json()) as Pick<AuthResponse, 'user'>;
  keepOnDevice(token, user);
  return { token, user };
}

/** Guests are kept on this device (so "Switch player" can be undone); accounts are not. */
function keepOnDevice(token: string, user: AuthResponse['user']) {
  if (user.isGuest)
    rememberPlayer({ id: user.id, nickname: user.nickname, avatar: user.avatar, token });
  else forgetPlayer(user.id);
}

/** Use this login on this device (a saved player, or a recovery link); `restoreSession` then checks it. */
export const adoptToken = (token: string) => writeToken(token);

/** Takes `?recover=<token>` out of the address and uses it as the login (a link from an admin or from Profile). */
export function consumeRecoveryLink(): boolean {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('recover');
    if (!token) return false;
    url.searchParams.delete('recover');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    writeToken(token);
    return true;
  } catch {
    return false;
  }
}

/** The link that logs this guest in again anywhere (treat it like a password). */
export const recoveryUrl = (token: string) =>
  `${window.location.origin}/?recover=${encodeURIComponent(token)}`;

export async function createGuest(profile: ProfileInput): Promise<AuthResponse> {
  const res = await fetch('/api/auth/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  });
  const body = (await res.json()) as AuthResponse & { error?: string };
  if (!res.ok) throw new Error(apiError(body, 'Could not create your guest account'));
  writeToken(body.token);
  keepOnDevice(body.token, body.user);
  return body;
}

/** Save a new nickname/avatar for the signed-in guest. */
export async function updateProfile(
  token: string,
  profile: ProfileInput,
): Promise<AuthResponse['user']> {
  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  const body = (await res.json()) as Pick<AuthResponse, 'user'> & { error?: string };
  if (!res.ok) throw new Error(apiError(body, 'Could not save your profile'));
  keepOnDevice(token, body.user);
  return body.user;
}

/** "Switch player": only the active login goes; saved guests stay (see lib/players.ts). */
export function forgetSession() {
  writeToken(null);
}

// ---- accounts -------------------------------------------------------------------------------

async function request<T>(
  method: string,
  url: string,
  token: string | null,
  body?: unknown,
  fallback = 'Something went wrong',
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) throw new Error(apiError(data, fallback));
  return data;
}

export const startRegister = (token: string, email: string) =>
  request<{ ok: true }>('POST', '/api/account/register/start', token, { email });

export const verifyRegister = (token: string, email: string, code: string, password: string) =>
  request<Pick<AuthResponse, 'user'>>('POST', '/api/account/register/verify', token, {
    email,
    code,
    password,
  }).then((r) => {
    keepOnDevice(token, r.user);
    return r.user;
  });

export const startReset = (email: string) =>
  request<{ ok: true }>('POST', '/api/auth/reset/start', null, { email });

export const verifyReset = (email: string, code: string, password: string) =>
  request<{ ok: true }>('POST', '/api/auth/reset/verify', null, { email, code, password });

/** Log in; the token is stored. `guestToken` is the guest this device had, to offer a merge. */
export async function login(
  email: string,
  password: string,
): Promise<{ auth: AuthResponse; guest: { token: string; games: number } | null }> {
  const previous = readToken();
  const auth = await request<AuthResponse>('POST', '/api/auth/login', null, { email, password });
  let guest: { token: string; games: number } | null = null;
  if (previous && previous !== auth.token) {
    const stats = await fetchStats(previous).catch(() => []);
    const games = stats.reduce((n, s) => n + s.games, 0);
    if (games > 0) guest = { token: previous, games };
  }
  writeToken(auth.token);
  return { auth, guest };
}

export const mergeGuest = (token: string, guestToken: string) =>
  request<{ moved: number }>('POST', '/api/account/merge', token, { guestToken });

export const fetchStats = (token: string) =>
  request<{ stats: GameStatsView[] }>('GET', '/api/me/stats', token).then((r) => r.stats);

/** The developer's display name for the credit line on Home (null when unknown or the server is unreachable). */
export const fetchDeveloper = (): Promise<string | null> =>
  fetch('/api/credits')
    .then((r) => (r.ok ? (r.json() as Promise<{ developer?: string | null }>) : null))
    .then((b) => b?.developer ?? null)
    .catch(() => null);

/** How many players are online right now (null when unknown). */
export const fetchOnline = (): Promise<number | null> =>
  fetch('/api/online')
    .then((r) => (r.ok ? (r.json() as Promise<{ players?: number }>) : null))
    .then((b) => (typeof b?.players === 'number' ? b.players : null))
    .catch(() => null);

export const fetchLeaderboard = (game: string) =>
  request<{ entries: LeaderboardRow[] }>('GET', `/api/leaderboard?game=${game}`, null).then(
    (r) => r.entries,
  );

export const deleteAccount = (token: string, password: string) =>
  request<{ ok: true }>('DELETE', '/api/me', token, { password });

export async function uploadAvatar(token: string, image: Blob): Promise<AuthResponse['user']> {
  const res = await fetch('/api/me/avatar', {
    method: 'PUT',
    headers: { 'content-type': image.type, authorization: `Bearer ${token}` },
    body: image,
  });
  const data = (await res.json().catch(() => ({}))) as Pick<AuthResponse, 'user'> & {
    error?: string;
  };
  if (!res.ok) throw new Error(apiError(data, 'Could not upload your picture'));
  return data.user;
}

export const removeAvatar = (token: string) =>
  request<Pick<AuthResponse, 'user'>>('DELETE', '/api/me/avatar', token).then((r) => r.user);

/** Square-crop and shrink a chosen photo to 256px (WebP, else JPEG) so it stays a few dozen KB. */
export async function resizeImage(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot resize pictures');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (blob && blob.type === 'image/webp') return blob;
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!jpeg) throw new Error('Could not process that picture');
  return jpeg;
}
