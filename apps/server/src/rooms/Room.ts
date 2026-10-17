import type {
  AnyGameDefinition,
  ChatMessage,
  GameResults,
  LeaveReason,
  PublicRoomSummary,
  PublicUser,
  Result,
  Rng,
  RoomSettingsInput,
  RoomStatus,
  RoomView,
  Visibility,
} from '@pogo/shared';

export interface RoomLimits {
  graceMs: number;
  emptyTtlMs: number;
  /** Pause between consecutive auto-played moves of one turn, so others can follow along. */
  autoStepMs: number;
}

export interface RoomDeps {
  rng: Rng;
  now(): number;
  limits: RoomLimits;
  /** Push the room (or null) to a user. */
  emit(userId: string, room: RoomView | null, reason?: LeaveReason): void;
  /** A member is no longer in the room (left, kicked, evicted). */
  onMemberGone(room: Room, userId: string, reason: LeaveReason): void;
  /** Nobody is left, or the room timed out. */
  onEmpty(room: Room): void;
  /** Deliver one chat message to a user. */
  emitChat(userId: string, message: ChatMessage): void;
  /** Deliver the recent chat history to a user (on join / reconnect). */
  emitHistory(userId: string, messages: ChatMessage[]): void;
  /** Applied to every chat message before anyone sees it (profanity filter, or identity when off). */
  maskText(text: string): string;
  /** Something about the room changed (the public lobby list may need refreshing). */
  onChange(room: Room): void;
}

const CHAT_HISTORY_LIMIT = 100;

interface Member {
  user: PublicUser;
  connected: boolean;
  left: boolean;
  /** When the member last became absent (disconnected or left); null while present. */
  absentSince: number | null;
}

export interface RoomInit {
  code: string;
  createdAt: number;
  game: AnyGameDefinition;
  host: PublicUser;
  visibility: Visibility;
  maxPlayers: number;
  options: unknown;
  turnTimeSec: number;
}

const fail = (error: string): Result<never> => ({ ok: false, error });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });

/**
 * One room: membership, settings and the lifecycle of one game session. Contains no
 * game-specific code; everything about the game comes from the GameDefinition.
 */
export class Room {
  readonly code: string;
  readonly createdAt: number;
  readonly game: AnyGameDefinition;
  hostId: string;
  visibility: Visibility;
  maxPlayers: number;
  options: unknown;
  turnTimeSec: number;
  status: RoomStatus = 'lobby';

  private members: Member[] = [];
  private messages: ChatMessage[] = [];
  private nextMessageId = 1;
  private readonly banned = new Set<string>();
  private state: unknown;
  private results: GameResults | undefined;
  private turnStartedAt = 0;
  private turnDeadline: number | null = null;
  private nextAutoAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(
    init: RoomInit,
    private readonly deps: RoomDeps,
  ) {
    this.code = init.code;
    this.createdAt = init.createdAt;
    this.game = init.game;
    this.hostId = init.host.id;
    this.visibility = init.visibility;
    this.maxPlayers = init.maxPlayers;
    this.options = init.options;
    this.turnTimeSec = init.turnTimeSec;
    this.members.push({ user: init.host, connected: true, left: false, absentSince: null });
  }

  // ---- membership -------------------------------------------------------------------------

  hasMember(userId: string): boolean {
    return this.members.some((m) => m.user.id === userId && !m.left);
  }

  get activeMemberIds(): string[] {
    return this.members.filter((m) => !m.left).map((m) => m.user.id);
  }

  get memberCount(): number {
    return this.activeMemberIds.length;
  }

  join(user: PublicUser): Result<null> {
    if (this.banned.has(user.id)) return fail('You were removed from this room');
    if (this.hasMember(user.id)) return ok(null);
    if (this.status !== 'lobby') return fail('This game has already started');
    if (this.memberCount >= this.maxPlayers) return fail('This room is full');
    this.members.push({ user, connected: true, left: false, absentSince: null });
    this.changed();
    return ok(null);
  }

  /** Voluntary leave. Mid-game the seat stays (auto-played) until the game ends. */
  leave(userId: string, reason: LeaveReason = 'left'): void {
    const member = this.members.find((m) => m.user.id === userId && !m.left);
    if (!member) return;
    if (this.status === 'playing') {
      member.left = true;
      member.connected = false;
      member.absentSince = this.deps.now();
    } else {
      this.members = this.members.filter((m) => m !== member);
    }
    this.deps.onMemberGone(this, userId, reason);
    this.afterMembershipChange(userId);
  }

  kick(hostId: string, targetId: string): Result<null> {
    if (hostId !== this.hostId) return fail('Only the host can remove players');
    if (targetId === hostId) return fail('You cannot remove yourself');
    if (!this.hasMember(targetId)) return fail('That player is not in the room');
    this.banned.add(targetId);
    this.leave(targetId, 'kicked');
    return ok(null);
  }

  setPresence(userId: string, connected: boolean): void {
    const member = this.members.find((m) => m.user.id === userId && !m.left);
    if (!member || member.connected === connected) return;
    member.connected = connected;
    member.absentSince = connected ? null : this.deps.now();
    if (connected && this.status === 'playing' && this.isCurrent(userId)) {
      // They are back: give them a fresh turn clock instead of continuing auto-play.
      this.nextAutoAt = null;
      this.startTurnClock();
    }
    this.changed();
  }

  private afterMembershipChange(removedId: string): void {
    if (this.destroyed) return;
    if (this.memberCount === 0) {
      this.destroy();
      return;
    }
    if (removedId === this.hostId) {
      const next =
        this.members.find((m) => !m.left && m.connected) ?? this.members.find((m) => !m.left);
      if (next) this.hostId = next.user.id;
    }
    this.changed();
  }

  // ---- chat -------------------------------------------------------------------------------

  /** Post a message from a member (text is already sanitized by the caller's schema). */
  chat(userId: string, text: string): Result<null> {
    const member = this.members.find((m) => m.user.id === userId && !m.left);
    if (!member) return fail('You are not in this room');
    const message: ChatMessage = {
      id: this.nextMessageId++,
      userId,
      nickname: member.user.nickname,
      avatar: member.user.avatar,
      text: this.deps.maskText(text),
      at: this.deps.now(),
    };
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY_LIMIT) this.messages.shift();
    for (const m of this.members) {
      if (!m.left) this.deps.emitChat(m.user.id, message);
    }
    return ok(null);
  }

  sendHistory(userId: string): void {
    this.deps.emitHistory(userId, [...this.messages]);
  }

  // ---- public lobby -----------------------------------------------------------------------

  /** How this room appears in the public lobby list, or null if it should not be listed. */
  summary(): PublicRoomSummary | null {
    if (this.visibility !== 'public' || this.status !== 'lobby') return null;
    if (this.memberCount >= this.maxPlayers) return null;
    const host = this.members.find((m) => m.user.id === this.hostId);
    return {
      code: this.code,
      gameId: this.game.id,
      gameName: this.game.name,
      hostNickname: host?.user.nickname ?? '',
      hostAvatar: host?.user.avatar ?? '',
      players: this.memberCount,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
    };
  }

  // ---- settings & lifecycle ----------------------------------------------------------------

  updateSettings(userId: string, patch: RoomSettingsInput): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can change settings');
    if (this.status !== 'lobby') return fail('Settings are locked once the game has started');

    let { maxPlayers, options } = this;
    if (patch.maxPlayers !== undefined) {
      if (patch.maxPlayers < this.game.minPlayers || patch.maxPlayers > this.game.maxPlayers) {
        return fail(
          `${this.game.name} supports ${this.game.minPlayers}-${this.game.maxPlayers} players`,
        );
      }
      if (patch.maxPlayers < this.memberCount)
        return fail('There are already more players than that');
      maxPlayers = patch.maxPlayers;
    }
    if (patch.options !== undefined) {
      const parsed = this.game.optionsSchema.safeParse(patch.options);
      if (!parsed.success) return fail('Invalid game options');
      options = parsed.data;
    }
    this.maxPlayers = maxPlayers;
    this.options = options;
    if (patch.visibility !== undefined) this.visibility = patch.visibility;
    if (patch.turnTimeSec !== undefined) this.turnTimeSec = patch.turnTimeSec;
    this.changed();
    return ok(null);
  }

  start(userId: string): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can start the game');
    if (this.status !== 'lobby') return fail('The game has already started');
    const players = this.members
      .filter((m) => !m.left)
      .map((m) => ({ id: m.user.id, nickname: m.user.nickname, avatar: m.user.avatar }));
    if (players.length < this.game.minPlayers) {
      return fail(`${this.game.name} needs at least ${this.game.minPlayers} player(s)`);
    }
    if (players.length > this.game.maxPlayers) return fail('Too many players for this game');

    this.state = this.game.createInitialState(players, this.options, this.deps.rng);
    this.results = undefined;
    this.status = 'playing';
    this.nextAutoAt = null;
    this.startTurnClock();
    this.afterStateChange();
    return ok(null);
  }

  rematch(userId: string): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can start a rematch');
    if (this.status !== 'finished') return fail('The game is not finished');
    for (const m of this.members.filter((x) => x.left)) {
      this.members = this.members.filter((x) => x !== m);
    }
    this.state = undefined;
    this.results = undefined;
    this.status = 'lobby';
    this.turnDeadline = null;
    this.nextAutoAt = null;
    this.changed();
    return ok(null);
  }

  // ---- gameplay ---------------------------------------------------------------------------

  move(userId: string, rawMove: unknown): Result<null> {
    if (this.status !== 'playing') return fail('No game in progress');
    if (!this.hasMember(userId)) return fail('You are not in this game');
    const parsed = this.game.moveSchema.safeParse(rawMove);
    if (!parsed.success) return fail('Invalid move');
    const check = this.game.validateMove(this.state, userId, parsed.data);
    if (!check.ok) return fail(check.error);

    this.state = this.game.applyMove(this.state, userId, parsed.data, this.deps.rng);
    this.nextAutoAt = null;
    this.startTurnClock();
    this.afterStateChange();
    return ok(null);
  }

  private isCurrent(userId: string): boolean {
    return this.status === 'playing' && this.game.getCurrentPlayers(this.state).includes(userId);
  }

  private startTurnClock(): void {
    this.turnStartedAt = this.deps.now();
    this.turnDeadline = this.turnTimeSec > 0 ? this.turnStartedAt + this.turnTimeSec * 1000 : null;
  }

  private afterStateChange(): void {
    if (this.game.isGameOver(this.state)) {
      this.results = this.game.getResults(this.state);
      this.status = 'finished';
      this.turnDeadline = null;
      this.nextAutoAt = null;
    }
    this.changed();
  }

  /** Auto-play for current players whose time ran out or who are absent. */
  private autoplay(): void {
    const autoMove = this.game.autoMove;
    if (!autoMove) {
      this.turnDeadline = null;
      this.nextAutoAt = null;
      return;
    }
    let endsTurn = true;
    for (const id of this.game.getCurrentPlayers(this.state)) {
      const auto = autoMove.call(this.game, this.state, id, this.deps.rng);
      this.state = this.game.applyMove(this.state, id, auto.move, this.deps.rng);
      endsTurn = endsTurn && auto.endsTurn;
    }
    if (endsTurn) {
      this.nextAutoAt = null;
      this.startTurnClock();
    } else {
      this.nextAutoAt = this.deps.now() + this.deps.limits.autoStepMs;
      this.turnDeadline = null;
    }
    this.afterStateChange();
  }

  // ---- timers -----------------------------------------------------------------------------

  private isAbsent(m: Member): boolean {
    return m.left || !m.connected;
  }

  private currentMembers(): Member[] {
    const ids = this.game.getCurrentPlayers(this.state);
    return this.members.filter((m) => ids.includes(m.user.id));
  }

  private actionDeadline(): number | null {
    if (this.status !== 'playing') return null;
    if (this.nextAutoAt !== null) return this.nextAutoAt;
    const candidates: number[] = [];
    if (this.turnDeadline !== null) candidates.push(this.turnDeadline);
    const current = this.currentMembers();
    if (current.length > 0 && current.every((m) => this.isAbsent(m))) {
      const since = Math.max(this.turnStartedAt, ...current.map((m) => m.absentSince ?? 0));
      candidates.push(since + this.deps.limits.graceMs);
    }
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  private abandonedAt(): number | null {
    if (this.members.length === 0 || !this.members.every((m) => this.isAbsent(m))) return null;
    return Math.max(...this.members.map((m) => m.absentSince ?? 0)) + this.deps.limits.emptyTtlMs;
  }

  private nextWake(): number | null {
    const wakes: number[] = [];
    if (this.status === 'lobby') {
      for (const m of this.members) {
        if (!m.connected && m.absentSince !== null) {
          wakes.push(m.absentSince + this.deps.limits.graceMs);
        }
      }
    }
    const action = this.actionDeadline();
    if (action !== null) wakes.push(action);
    const abandoned = this.abandonedAt();
    if (abandoned !== null) wakes.push(abandoned);
    return wakes.length > 0 ? Math.min(...wakes) : null;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.destroyed) return;
    const wake = this.nextWake();
    if (wake === null) return;
    this.timer = setTimeout(() => this.tick(), Math.max(0, wake - this.deps.now()));
  }

  private tick(): void {
    this.timer = undefined;
    const now = this.deps.now();

    const abandoned = this.abandonedAt();
    if (abandoned !== null && now >= abandoned) {
      this.destroy();
      return;
    }

    if (this.status === 'lobby') {
      const gone = this.members.filter(
        (m) =>
          !m.connected && m.absentSince !== null && now >= m.absentSince + this.deps.limits.graceMs,
      );
      for (const m of gone) {
        this.members = this.members.filter((x) => x !== m);
        this.deps.onMemberGone(this, m.user.id, 'timeout');
        this.afterMembershipChange(m.user.id);
        if (this.destroyed) return;
      }
    }

    const action = this.actionDeadline();
    if (action !== null && now >= action) this.autoplay();
    else this.schedule();
  }

  // ---- output -----------------------------------------------------------------------------

  view(forUserId: string): RoomView {
    const base: RoomView = {
      code: this.code,
      gameId: this.game.id,
      gameName: this.game.name,
      hostId: this.hostId,
      visibility: this.visibility,
      minPlayers: this.game.minPlayers,
      maxPlayers: this.maxPlayers,
      options: this.options,
      turnTimeSec: this.turnTimeSec,
      status: this.status,
      members: this.members.map((m) => ({
        id: m.user.id,
        nickname: m.user.nickname,
        avatar: m.user.avatar,
        connected: m.connected && !m.left,
        left: m.left,
      })),
      serverTime: this.deps.now(),
    };
    if (this.status === 'lobby') return base;
    return {
      ...base,
      game: {
        view: this.game.getPlayerView(this.state, forUserId),
        currentPlayers: this.game.getCurrentPlayers(this.state),
        deadline: this.nextAutoAt ?? this.turnDeadline,
        results: this.results,
      },
    };
  }

  /** Push fresh state to everyone present and re-arm timers. Call after any change. */
  private changed(): void {
    this.broadcast();
    this.schedule();
    this.deps.onChange(this);
  }

  broadcast(): void {
    for (const m of this.members) {
      if (!m.left) this.deps.emit(m.user.id, this.view(m.user.id));
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.deps.onEmpty(this);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}
