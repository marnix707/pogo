import { randomInt } from 'node:crypto';
import type {
  AnyGameDefinition,
  LeaveReason,
  PublicUser,
  Result,
  Rng,
  RoomCreateInput,
  RoomSettingsInput,
  RoomView,
} from '@pogo/shared';
import { roomCreateSchema } from '@pogo/shared';
import { Room } from './Room';
import type { RoomLimits } from './Room';

// No 0/O/1/I/L: codes are read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_ROOMS = 2000;

const fail = (error: string): Result<never> => ({ ok: false, error });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export interface RoomManagerDeps {
  getGame(id: string): AnyGameDefinition | undefined;
  rng: Rng;
  emit(userId: string, room: RoomView | null, reason?: LeaveReason): void;
  limits: RoomLimits;
  defaultTurnTimeSec: number;
  now?: () => number;
}

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
        onMemberGone: (room, userId, reason) => {
          if (this.roomOfUser.get(userId) === room.code) this.roomOfUser.delete(userId);
          this.deps.emit(userId, null, reason);
        },
        onEmpty: (room) => {
          this.rooms.delete(room.code);
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
    const { gameId, visibility, maxPlayers, turnTimeSec } = parsed.data;

    const game = this.deps.getGame(gameId);
    if (!game) return fail('Unknown game');
    const options = game.optionsSchema.safeParse(parsed.data.options ?? game.defaultOptions);
    if (!options.success) return fail('Invalid game options');
    const max = maxPlayers ?? game.maxPlayers;
    if (max < game.minPlayers || max > game.maxPlayers) {
      return fail(`${game.name} supports ${game.minPlayers}-${game.maxPlayers} players`);
    }
    if (this.rooms.size >= MAX_ROOMS) return fail('The server is busy, try again in a moment');

    const released = this.releaseUser(user.id);
    if (!released.ok) return released;

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = this.makeRoom(code, {
      game,
      host: user,
      visibility,
      maxPlayers: max,
      options: options.data,
      turnTimeSec: turnTimeSec ?? this.deps.defaultTurnTimeSec,
    });
    this.rooms.set(code, room);
    this.roomOfUser.set(user.id, code);
    room.broadcast();
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
    return ok(room.view(user.id));
  }

  leave(userId: string): Result<null> {
    const room = this.roomFor(userId);
    if (!room) return ok(null);
    room.leave(userId);
    return ok(null);
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

  start(userId: string): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.start(userId);
    return result.ok ? ok(room.view(userId)) : result;
  }

  rematch(userId: string): Result<RoomView> {
    const room = this.roomFor(userId);
    if (!room) return fail('You are not in a room');
    const result = room.rematch(userId);
    return result.ok ? ok(room.view(userId)) : result;
  }

  move(userId: string, move: unknown): Result<null> {
    const room = this.roomFor(userId);
    return room ? room.move(userId, move) : fail('You are not in a room');
  }

  /** The user's first socket connected: mark present and send their room (reconnect). */
  userConnected(userId: string): void {
    this.roomFor(userId)?.setPresence(userId, true);
  }

  /** The user's last socket went away. */
  userDisconnected(userId: string): void {
    this.roomFor(userId)?.setPresence(userId, false);
  }
}
