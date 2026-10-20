import type { AuthResponse, ProfileInput } from '@pogo/shared';

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
  if (!res.ok) throw new Error(body.error ?? 'Could not save your icon');
  return body.user;
}

export function forgetSession() {
  writeToken(null);
}
