import { failResult } from '@pogo/shared';
import { randomInt } from 'node:crypto';
import type {
  AdminRoomRow,
  AnyGameDefinition,
  ChatMessage,
  LeaveReason,
  PublicRoomSummary,
  PublicUser,
  Result,
  Rng,
  RoomCreateInput,
  RoomSettingsInput,
  RoomView,
} from '@pogo/shared';
import { roomCreateSchema } from '@pogo/shared';
import { Room } from './Room';
import type { FinishedGame, RoomLimits } from './Room';

// No 0/O/1/I/L: codes are read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_ROOMS = 2000;

const fail = (error: string): Result<never> => failResult(error);
const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export interface RoomManagerDeps {
  getGame(id: string): AnyGameDefinition | undefined;
  rng: Rng;
  emit(userId: string, room: RoomView | null, reason?: LeaveReason): void;
  limits: RoomLimits;
  defaultTurnTimeSec: number;
  /** Chat text filter; pass an identity function to switch the profanity filter off. */
  maskText(text: string): string;
  emitChat(userId: string, message: ChatMessage): void;
  emitHistory(userId: string, messages: ChatMessage[]): void;
  /** The set of public rooms (or their contents) may have changed. */
  onLobbyChanged(): void;
  /** A game ended (stats are recorded here). */
  onGameFinished(finished: FinishedGame): void;
  now?: () => number;
}

const LOBBY_LIST_LIMIT = 50;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Owns every room on this server. Game-agnostic: games are looked up by id via getGame. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOfUser = new Map<string, string>();
  private readonly now: () => number;

  constructor(private readonly deps: RoomManagerDeps) {
    this.now = deps.now ?? Date.now;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private roomFor(userId: string): Room | undefined {
    const code = this.roomOfUser.get(userId);
    return code ? this.rooms.get(code) : undefined;
  }

  getView(userId: string): RoomView | null {
    return this.roomFor(userId)?.view(userId) ?? null;
  }

  private makeRoom(code: string, init: Omit<ConstructorParameters<typeof Room>[0], 'code'>): Room {
    return new Room(
      { ...init, code },
      {
        rng: this.deps.rng,
        now: this.now,
        limits: this.deps.limits,
        emit: this.deps.emit,
        maskText: this.deps.maskText,
        emitChat: this.deps.emitChat,
        emitHistory: this.deps.emitHistory,
        onChange: () => this.deps.onLobbyChanged(),
        onGameFinished: (finished) => this.deps.onGameFinished(finished),
        onMemberGone: (room, userId, reason) => {
          if (this.roomOfUser.get(userId) === room.code) this.roomOfUser.delete(userId);
          this.deps.emit(userId, null, reason);
        },
        onEmpty: (room) => {
          this.rooms.delete(room.code);
          this.deps.onLobbyChanged();
          for (const [userId, code] of this.roomOfUser) {
            if (code === room.code) {
              this.roomOfUser.delete(userId);
              this.deps.emit(userId, null, 'closed');
            }
          }
        },
      },
    );
  }

  /** Free the user from a lobby/finished room so they can enter another. */
  private releaseUser(userId: string): Result<null> {
    const current = this.roomFor(userId);
    if (!current) return ok(null);
    if (current.status === 'playing') return fail('Finish or leave your current game first');
    current.leave(userId);
    return ok(null);
  }

  create(user: PublicUser, input: RoomCreateInput): Result<RoomView> {
    const parsed = roomCreateSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid room settings');
    const {
      gameId,
      visibility,
      maxPlayers,
      turnTimeSec,
      bots = 0,
      autoStart = false,
    } = parsed.data;

    const game = this.deps.getGame(gameId);
    if (!game) return fail('Unknown game');
    const options = game.optionsSchema.safeParse(parsed.data.options ?? game.defaultOptions);
    if (!options.success) return fail('Invalid game options');
    const max = maxPlayers ?? game.maxPlayers;
    if (max < game.minPlayers || max > game.maxPlayers) {
      return fail(`${game.name} supports ${game.minPlayers}-${game.maxPlayers} players`);
    }
    if (bots > 0 && !game.supportsBots)
      return fail(`${game.name} cannot be played against the computer`);
    if (1 + bots > game.maxPlayers)
      return fail(`${game.name} supports at most ${game.maxPlayers} players`);
    if (this.rooms.size >= MAX_ROOMS) return fail('The server is busy, try again in a moment');

    const released = this.releaseUser(user.id);
    if (!released.ok) return released;

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = this.makeRoom(code, {
      createdAt: this.now(),
      game,
      host: user,
      visibility,
      maxPlayers: max,
      options: options.data,
      turnTimeSec: turnTimeSec ?? this.deps.defaultTurnTimeSec,
      bots,
    });
    this.rooms.set(code, room);
    this.roomOfUser.set(user.id, code);
    room.broadcast();
    room.sendHistory(user.id);
    this.deps.onLobbyChanged();
    if (autoStart) {
      const started = room.start(user.id);
      if (!started.ok) {
        room.leave(user.id); // nobody else is in it, so this closes the room again
        return started;
      }
    }
    return ok(room.view(user.id));
  }

  join(user: PublicUser, code: string): Result<RoomView> {
    const room = this.rooms.get(code);
    if (!room) return fail('Room not found');
    if (this.roomOfUser.get(user.id) !== code) {
      const released = this.releaseUser(user.id);
      if (!released.ok) return released;
    }
    const joined = room.join(user);
    if (!joined.ok) return joined;
    this.roomOfUser.set(user.id, code);
    room.sendHistory(user.id);
    return ok(room.view(user.id));
  }

  /** Open public rooms that someone can join right now, longest-waiting first. */
  listPublic(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .map((room) => room.summary())
      .filter((s): s is PublicRoomSummary => s !== null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, LOBBY_LIST_LIMIT);
  }

  /** Join the longest-waiting open public room for this game, or open a new public one. */
  quickPlay(user: PublicUser, gameId: string): Result<RoomView> {
    const own = this.roomFor(user.id);
    if (own && own.game.id === gameId && own.status === 'lobby') return ok(own.view(user.id));
    for (const candidate of this.listPublic()) {
      if (candidate.gameId !== gameId) continue;
      const joined = this.join(user, candidate.code);
      if (joined.ok) return joined;
    }
    return this.create(user, { gameId, visibility: 'public' });
  }

  chat(userId: string, text: string): Result<null> {
    const room = this.roomFor(userId);
    return room ? room.chat(userId, text) : fail('You are not in a room');
  }

  leave(userId: string): Result<null> {
    const room = this.roomFor(userId);
    if (!room) return ok(null);
    room.leave(userId);
    return ok(null);
  }

  /** Staff removal: the player is taken out of whatever room they are in (shown as "kicked"). */
  evict(userId: string): boolean {
    const room = this.roomFor(userId);
    if (!room) return false;
    room.leave(userId, 'kicked');
    return true;
  }

  roomCodeOf(userId: string): string | null {
    return this.roomOfUser.get(userId) ?? null;
  }

  /** Every room, for the admin panel. */
  listAll(): AdminRoomRow[] {
    return [...this.rooms.values()].map((r) => r.adminSummary());
  }

  kick(hostId: string, targetId: string): Result<null> {
    const room = this.roomFor(hostId);
    return room ? room.kick(hostId, targetId) : fail('You are not in a room');
  }

  updateSettings(userId: string, patch: RoomSettingsInput): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.updateSettings(userId, patch);
    return result.ok ? ok(room.view(userId)) : result;
  }

  setGame(userId: string, gameId: string): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const game = this.deps.getGame(gameId);
    if (!game) return fail('Unknown game');
    const result = room.setGame(userId, game);
    return result.ok ? ok(room.view(userId)) : result;
  }

  setReady(userId: string, ready: boolean): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.setReady(userId, ready);
    return result.ok ? ok(room.view(userId)) : result;
  }

  suggest(userId: string, gameId: string | null): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const game = gameId === null ? null : this.deps.getGame(gameId);
    if (gameId !== null && !game) return fail('Unknown game');
    const result = room.suggest(userId, game ?? null);
    return result.ok ? ok(room.view(userId)) : result;
  }

  setReadyLock(userId: string, locked: boolean): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.setReadyLock(userId, locked);
    return result.ok ? ok(room.view(userId)) : result;
  }

  start(userId: string): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.start(userId);
    return result.ok ? ok(room.view(userId)) : result;
  }

  rematch(userId: string, toLobby = false): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.rematch(userId, toLobby);
    return result.ok ? ok(room.view(userId)) : result;
  }

  move(userId: string, move: unknown): Result<null> {
    const room = this.roomFor(userId);
    return room ? room.move(userId, move) : fail('You are not in a room');
  }

  /** The user's first socket connected: mark present and send their room (reconnect). */
  userConnected(userId: string): void {
    const room = this.roomFor(userId);
    if (!room) return;
    room.setPresence(userId, true);
    room.sendHistory(userId);
  }

  /** The user's last socket went away. */
  userDisconnected(userId: string): void {
    this.roomFor(userId)?.setPresence(userId, false);
  }
}
