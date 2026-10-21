import type { AuthResponse, GameStatsView, LeaderboardRow, ProfileInput } from '@pogo/shared';

const TOKEN_KEY = 'pogo.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
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
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'You are banned.');
  }
  if (!res.ok) throw new Error('Could not reach the server');
  const { user } = (await res.json()) as Pick<AuthResponse, 'user'>;
  return { token, user };
}

export async function createGuest(profile: ProfileInput): Promise<AuthResponse> {
  const res = await fetch('/api/auth/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  });
  const body = (await res.json()) as AuthResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Could not create your guest account');
  writeToken(body.token);
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
  if (!res.ok) throw new Error(body.error ?? 'Could not save your profile');
  return body.user;
}

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
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}

export const startRegister = (token: string, email: string) =>
  request<{ ok: true }>('POST', '/api/account/register/start', token, { email });

export const verifyRegister = (token: string, email: string, code: string, password: string) =>
  request<Pick<AuthResponse, 'user'>>('POST', '/api/account/register/verify', token, {
    email,
    code,
    password,
  }).then((r) => r.user);

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
  if (!res.ok) throw new Error(data.error ?? 'Could not upload your picture');
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
