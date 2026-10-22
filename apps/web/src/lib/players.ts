/**
 * Guests this device has played as. "Switch player" only forgets the active login; the guest stays
 * here, so the sign-in screen can offer "Continue as <name>" and nothing is lost by accident.
 * (A guest's token is the only thing that identifies it: without it the stats are unreachable.)
 * Registered accounts are not kept here: they log in with a password.
 */
export interface SavedPlayer {
  id: string;
  nickname: string;
  avatar: string;
  token: string;
  /** A recovery link was copied: forgetting the player on this device is then not a loss. */
  recoverySaved: boolean;
}

const KEY = 'pogo.players';
export const MAX_PLAYERS = 8;

/** Parses the stored list, ignoring anything that does not look right (corrupt or old storage). */
export function parsePlayers(raw: string | null): SavedPlayer[] {
  try {
    const list = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (p): p is SavedPlayer =>
          !!p &&
          typeof p.id === 'string' &&
          typeof p.nickname === 'string' &&
          typeof p.avatar === 'string' &&
          typeof p.token === 'string',
      )
      .map((p) => ({ ...p, recoverySaved: p.recoverySaved === true }))
      .slice(0, MAX_PLAYERS);
  } catch {
    return [];
  }
}

/** Puts the player first (keeping what we know about a recovery link) and caps the list. */
export function upsertPlayer(list: SavedPlayer[], player: Omit<SavedPlayer, 'recoverySaved'>) {
  const old = list.find((p) => p.id === player.id);
  const next: SavedPlayer = { ...player, recoverySaved: old?.recoverySaved ?? false };
  return [next, ...list.filter((p) => p.id !== player.id)].slice(0, MAX_PLAYERS);
}

export const removePlayer = (list: SavedPlayer[], id: string): SavedPlayer[] =>
  list.filter((p) => p.id !== id);

export const markRecoverySaved = (list: SavedPlayer[], id: string): SavedPlayer[] =>
  list.map((p) => (p.id === id ? { ...p, recoverySaved: true } : p));

// ---- storage -------------------------------------------------------------------------------

export function readPlayers(): SavedPlayer[] {
  try {
    return parsePlayers(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** True when the list was written (false in private mode or with blocked storage). */
function writePlayers(list: SavedPlayer[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const rememberPlayer = (player: Omit<SavedPlayer, 'recoverySaved'>): boolean =>
  writePlayers(upsertPlayer(readPlayers(), player));

export const forgetPlayer = (id: string): void => {
  writePlayers(removePlayer(readPlayers(), id));
};

export const rememberRecoverySaved = (id: string): void => {
  writePlayers(markRecoverySaved(readPlayers(), id));
};

/** Is this player kept on this device (so a switch can be undone)? */
export const isKeptOnDevice = (id: string): boolean => readPlayers().some((p) => p.id === id);
