import { BOT_AVATAR, BOT_NAMES, botId } from '@pogo/shared';
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
  /** How long a computer player "thinks" before each move. */
  botMs: number;
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
  /** A game just ended: one entry per human player (computer players are not included). */
  onGameFinished(finished: FinishedGame): void;
}

export interface FinishedGame {
  gameId: string;
  /** Unique per game played (a room's rematches get their own). */
  matchId: string;
  results: GameResults;
  /** Human players only. */
  humans: string[];
  players: number;
  bots: number;
}

const CHAT_HISTORY_LIMIT = 100;

interface Member {
  user: PublicUser;
  connected: boolean;
  left: boolean;
  /** When the member last became absent (disconnected or left); null while present. */
  absentSince: number | null;
  /** A computer player: no socket, moves by itself. */
  bot?: boolean;
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
  /** Computer players that join when the game starts. */
  bots: number;
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
  /** Number of computer players added when the game starts. */
  bots: number;
  status: RoomStatus = 'lobby';

  private members: Member[] = [];
  private messages: ChatMessage[] = [];
  private nextMessageId = 1;
  private readonly banned = new Set<string>();
  private state: unknown;
  private results: GameResults | undefined;
  private gameNo = 0;
  private turnStartedAt = 0;
  private turnDeadline: number | null = null;
  private nextAutoAt: number | null = null;
  /** When the game state last changed (computer players wait a moment after it). */
  private lastChangeAt = 0;
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
    this.bots = init.bots;
    this.members.push({ user: init.host, connected: true, left: false, absentSince: null });
  }

  // ---- membership -------------------------------------------------------------------------

  /** People in the room (computer players are seats in the game, not members). */
  hasMember(userId: string): boolean {
    return this.members.some((m) => m.user.id === userId && !m.left && !m.bot);
  }

  get activeMemberIds(): string[] {
    return this.members.filter((m) => !m.left && !m.bot).map((m) => m.user.id);
  }

  get memberCount(): number {
    return this.activeMemberIds.length;
  }

  join(user: PublicUser): Result<null> {
    if (this.banned.has(user.id)) return fail('You were removed from this room');
    if (this.hasMember(user.id)) return ok(null);
    if (this.status !== 'lobby') return fail('This game has already started');
    if (this.memberCount >= this.maxPlayers) return fail('This room is full');
    if (this.memberCount + this.bots >= this.game.maxPlayers) return fail('This room is full');
    this.members.push({ user, connected: true, left: false, absentSince: null });
    this.changed();
    return ok(null);
  }

  /** Voluntary leave. Mid-game the seat stays (auto-played) until the game ends. */
  leave(userId: string, reason: LeaveReason = 'left'): void {
    const member = this.members.find((m) => m.user.id === userId && !m.left && !m.bot);
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
    const member = this.members.find((m) => m.user.id === userId && !m.left && !m.bot);
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
      const people = this.members.filter((m) => !m.bot);
      const next = people.find((m) => !m.left && m.connected) ?? people.find((m) => !m.left);
      if (next) this.hostId = next.user.id;
    }
    this.changed();
  }

  // ---- chat -------------------------------------------------------------------------------

  /** Post a message from a member (text is already sanitized by the caller's schema). */
  chat(userId: string, text: string): Result<null> {
    const member = this.members.find((m) => m.user.id === userId && !m.left && !m.bot);
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
      if (!m.left && !m.bot) this.deps.emitChat(m.user.id, message);
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
    if (this.memberCount + this.bots >= this.game.maxPlayers) return null;
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

    let { maxPlayers, options, bots } = this;
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
    if (patch.bots !== undefined) {
      if (patch.bots > 0 && !this.game.supportsBots) {
        return fail(`${this.game.name} cannot be played against the computer`);
      }
      if (this.memberCount + patch.bots > this.game.maxPlayers) {
        return fail(`${this.game.name} supports at most ${this.game.maxPlayers} players`);
      }
      bots = patch.bots;
    }
    if (patch.options !== undefined) {
      const parsed = this.game.optionsSchema.safeParse(patch.options);
      if (!parsed.success) return fail('Invalid game options');
      options = parsed.data;
    }
    this.maxPlayers = maxPlayers;
    this.bots = bots;
    this.options = options;
    if (patch.visibility !== undefined) this.visibility = patch.visibility;
    if (patch.turnTimeSec !== undefined) this.turnTimeSec = patch.turnTimeSec;
    this.changed();
    return ok(null);
  }

  start(userId: string): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can start the game');
    if (this.status !== 'lobby') return fail('The game has already started');
    if (this.bots > 0 && !this.game.supportsBots) {
      return fail(`${this.game.name} cannot be played against the computer`);
    }
    // Computer players take the last seats; drop any left over from a previous game first.
    this.members = this.members.filter((m) => !m.bot && !m.left);
    this.members.push(...this.makeBots());
    const players = this.members.map((m) => ({
      id: m.user.id,
      nickname: m.user.nickname,
      avatar: m.user.avatar,
    }));
    if (players.length < this.game.minPlayers) {
      this.members = this.members.filter((m) => !m.bot);
      return fail(`${this.game.name} needs at least ${this.game.minPlayers} player(s)`);
    }
    if (players.length > this.game.maxPlayers) {
      this.members = this.members.filter((m) => !m.bot);
      return fail('Too many players for this game');
    }

    this.state = this.game.createInitialState(players, this.options, this.deps.rng);
    this.results = undefined;
    this.gameNo += 1;
    this.status = 'playing';
    this.nextAutoAt = null;
    this.startTurnClock();
    this.afterStateChange();
    return ok(null);
  }

  rematch(userId: string, toLobby = false): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can start a rematch');
    if (this.status !== 'finished') return fail('The game is not finished');
    // Back to the waiting room: players who left and the computer players go away (the setting stays).
    this.members = this.members.filter((m) => !m.left && !m.bot);
    // The game may carry something over to the next one (e.g. a rule the winner picked).
    if (this.state && this.game.nextOptions)
      this.options = this.game.nextOptions(this.state, this.options);
    this.state = undefined;
    this.results = undefined;
    this.status = 'lobby';
    this.turnDeadline = null;
    this.nextAutoAt = null;
    if (!toLobby && this.game.restartOnRematch?.(this.options) && this.start(userId).ok)
      return ok(null);
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
    // A free move (sharing which dice are kept) must not buy more time.
    if (!this.game.isFreeMove?.(parsed.data)) {
      this.nextAutoAt = null;
      this.startTurnClock();
    }
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
    this.lastChangeAt = this.deps.now();
    if (this.game.isGameOver(this.state)) {
      this.results = this.game.getResults(this.state);
      this.status = 'finished';
      this.reportFinished(this.results);
      this.turnDeadline = null;
      this.nextAutoAt = null;
    }
    this.changed();
  }

  private reportFinished(results: GameResults): void {
    const humans = this.members.filter((m) => !m.bot).map((m) => m.user.id);
    try {
      this.deps.onGameFinished({
        gameId: this.game.id,
        matchId: `${this.code}-${this.gameNo}`,
        results,
        humans,
        players: this.members.length,
        bots: this.members.length - humans.length,
      });
    } catch {
      // Recording stats must never break a game.
    }
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

  // ---- computer players -------------------------------------------------------------------

  /** Seats for the computer players (names that no person in the room already uses). */
  private makeBots(): Member[] {
    const taken = new Set(this.members.map((m) => m.user.nickname.toLowerCase()));
    const names = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    return Array.from({ length: this.bots }, (_, i) => ({
      user: {
        id: botId(i),
        nickname: names[i] ?? `Bot ${i + 1}`,
        avatar: BOT_AVATAR,
        isGuest: true,
      },
      connected: true,
      left: false,
      absentSince: null,
      bot: true,
    }));
  }

  /** When a computer player should move next, or null if none is up (or nobody is here to play with). */
  private botDue(): number | null {
    if (this.destroyed || this.status !== 'playing') return null;
    if (!this.members.some((m) => m.bot)) return null;
    // Pause while every person is away; the game carries on when someone comes back.
    if (!this.members.some((m) => !m.bot && !m.left && m.connected)) return null;
    if (!this.currentMembers().some((m) => m.bot)) return null;
    const settle = this.state ? (this.game.settleMs?.(this.state) ?? 0) : 0;
    return this.lastChangeAt + Math.max(this.deps.limits.botMs, settle);
  }

  /** Every computer player who is up makes one move (they all act at once in simultaneous phases). */
  private playBots(): void {
    const autoMove = this.game.autoMove;
    if (!autoMove) return;
    for (const id of this.game.getCurrentPlayers(this.state)) {
      if (!this.members.find((m) => m.user.id === id)?.bot) continue;
      const auto = autoMove.call(this.game, this.state, id, this.deps.rng);
      this.state = this.game.applyMove(this.state, id, auto.move, this.deps.rng);
      if (this.game.isGameOver(this.state)) break;
    }
    this.nextAutoAt = null;
    this.startTurnClock(); // the next person (if any) gets a fresh turn clock
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
    // Absent players are only played for when the game has a turn timer: with unlimited time nothing
    // is ever played automatically (a dropped player can come back), except for people who left.
    const autoForAbsent =
      this.turnTimeSec > 0 ? current.every((m) => this.isAbsent(m)) : current.every((m) => m.left);
    if (current.length > 0 && autoForAbsent) {
      const since = Math.max(this.turnStartedAt, ...current.map((m) => m.absentSince ?? 0));
      candidates.push(since + this.deps.limits.graceMs);
    }
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  private abandonedAt(): number | null {
    const people = this.members.filter((m) => !m.bot);
    if (people.length === 0 || !people.every((m) => this.isAbsent(m))) return null;
    return Math.max(...people.map((m) => m.absentSince ?? 0)) + this.deps.limits.emptyTtlMs;
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
    const botAt = this.botDue();
    if (botAt !== null) wakes.push(botAt);
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

    const botAt = this.botDue();
    if (botAt !== null && now >= botAt) {
      this.playBots();
      return;
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
      bots: this.bots,
      options: this.options,
      turnTimeSec: this.turnTimeSec,
      status: this.status,
      members: this.members.map((m) => ({
        id: m.user.id,
        nickname: m.user.nickname,
        avatar: m.user.avatar,
        connected: m.connected && !m.left,
        left: m.left,
        bot: !!m.bot,
      })),
      serverTime: this.deps.now(),
    };
    if (this.status === 'lobby') return base;
    // While a computer player is thinking there is no human clock to show.
    const current = this.currentMembers();
    const onlyComputers = current.length > 0 && current.every((m) => m.bot);
    return {
      ...base,
      game: {
        view: this.game.getPlayerView(this.state, forUserId),
        currentPlayers: this.game.getCurrentPlayers(this.state),
        deadline: onlyComputers ? null : (this.nextAutoAt ?? this.turnDeadline),
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
      if (!m.left && !m.bot) this.deps.emit(m.user.id, this.view(m.user.id));
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
