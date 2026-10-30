import {
  BOT_AVATAR,
  BOT_NAMES,
  botId,
  createFixedRng,
  displayName,
  failResult,
} from '@pogo/shared';
import type {
  AdminRoomRow,
  BellMessage,
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
  /** Pause between everybody being ready and the game starting (default START_COUNTDOWN_MS). */
  startCountdownMs?: number;
  /** After a game, with everybody's Ready locked: how long the results stay before the next game starts by itself (default AUTO_NEXT_MS). */
  autoNextMs?: number;
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
  /** A chat message was posted (once per message, for the admin feed). */
  onChatSent?(room: { code: string; gameId: string }, message: ChatMessage): void;
  /** Deliver the recent chat history to a user (on join / reconnect). */
  emitHistory(userId: string, messages: ChatMessage[]): void;
  /** Somebody rang the bell: deliver it to one user (the others in the lobby). */
  emitBell(userId: string, bell: BellMessage): void;
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
  /** Everybody who played (computers too), for the match history. */
  roster: { id: string; nickname: string; avatar: string; bot: boolean }[];
  /** The game's own facts about this match (`GameDefinition.matchSummary`). */
  detail: Record<string, unknown> | null;
}

const CHAT_HISTORY_LIMIT = 100;
/** Ringing the bell again is possible after this long (per person). */
export const BELL_COOLDOWN_MS = 3000;
/** At most this many people watch one game. */
const MAX_SPECTATORS = 20;
/** After the last person is ready, the game starts this long later (anybody can cancel by un-readying). */
export const START_COUNTDOWN_MS = 3000;
/** The results stay this long when everybody locked Ready, then the next game starts by itself. */
export const AUTO_NEXT_MS = 12_000;

interface Member {
  user: PublicUser;
  connected: boolean;
  left: boolean;
  /** When the member last became absent (disconnected or left); null while present. */
  absentSince: number | null;
  /** A computer player: no socket, moves by itself. */
  bot?: boolean;
  /** Pressed Ready in the lobby. */
  ready?: boolean;
  /** Ready is locked: it survives setting changes, a switched game and a return to the lobby. */
  readyLock?: boolean;
  /** The game this member suggests for the next round (the host decides). */
  suggestion?: string | null;
  /** Watching a game in progress: chat and state, no seat; gets one when the room goes back to the lobby. */
  spectator?: boolean;
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
  /** The creator picked the timer explicitly (otherwise a lone solo game has none). */
  turnTimeChosen?: boolean;
  /** Computer players that join when the game starts. */
  bots: number;
}

const fail = (error: string): Result<never> => failResult(error);
const ok = <T>(data: T): Result<T> => ({ ok: true, data });

/**
 * One room: membership, settings and the lifecycle of one game session. Contains no
 * game-specific code; everything about the game comes from the GameDefinition.
 */
export class Room {
  readonly code: string;
  readonly createdAt: number;
  /** The game this room plays; the host can switch it in the lobby (the group stays together). */
  game: AnyGameDefinition;
  hostId: string;
  visibility: Visibility;
  maxPlayers: number;
  options: unknown;
  turnTimeSec: number;
  /** The host (or the creator) picked a turn timer: then it is used as picked, also when playing alone. */
  private turnTimeChosen: boolean;
  /** Number of computer players added when the game starts. */
  bots: number;
  /** Developer test game: fixed dice, never recorded. */
  testDice = false;
  status: RoomStatus = 'lobby';

  /** The Rng in force: a test game rolls a fixed face. */
  private get rng(): Rng {
    return this.testDice ? createFixedRng(6) : this.deps.rng;
  }

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
  /** When the lobby starts the game by itself (everybody ready), or null. */
  private startAt: number | null = null;
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
    this.turnTimeChosen = init.turnTimeChosen ?? false;
    this.bots = init.bots;
    this.members.push({ user: init.host, connected: true, left: false, absentSince: null });
  }

  // ---- membership -------------------------------------------------------------------------

  /** People in the room (computer players are seats in the game, not members). */
  hasMember(userId: string): boolean {
    return this.members.some((m) => m.user.id === userId && !m.left && !m.bot);
  }

  get activeMemberIds(): string[] {
    return this.members.filter((m) => !m.left && !m.bot && !m.spectator).map((m) => m.user.id);
  }

  /** A person with a seat (not a spectator, not a computer). */
  private seated(m: Member): boolean {
    return !m.left && !m.bot && !m.spectator;
  }

  private findSeated(userId: string): Member | undefined {
    return this.members.find((m) => m.user.id === userId && this.seated(m));
  }

  isSpectator(userId: string): boolean {
    return this.members.some((m) => m.user.id === userId && m.spectator && !m.left);
  }

  get spectatorCount(): number {
    return this.members.filter((m) => m.spectator && !m.left).length;
  }

  get memberCount(): number {
    return this.activeMemberIds.length;
  }

  /** Seats a group could still take in the lobby (0 when the game has started or the room is closed to them). */
  freeSeats(): number {
    if (this.status !== 'lobby') return 0;
    return Math.max(
      0,
      Math.min(this.maxPlayers, this.game.maxPlayers - this.bots) - this.memberCount,
    );
  }

  isBanned(userId: string): boolean {
    return this.banned.has(userId);
  }

  /** The people who would travel with the host: seated humans (not spectators, not computers). */
  followersOf(hostId: string): PublicUser[] {
    if (hostId !== this.hostId || this.status !== 'lobby') return [];
    return this.members
      .filter((m) => !m.left && !m.bot && !m.spectator && m.user.id !== hostId)
      .map((m) => m.user);
  }

  join(user: PublicUser): Result<null> {
    if (this.banned.has(user.id)) return fail('You were removed from this room');
    if (this.hasMember(user.id)) return ok(null);
    if (this.status !== 'lobby') {
      // A public game in progress can be watched; the watcher gets a seat in the next game.
      if (this.visibility !== 'public') return fail('This game has already started');
      if (this.spectatorCount >= MAX_SPECTATORS)
        return fail('Too many people are watching this game');
      this.members.push({ user, connected: true, left: false, absentSince: null, spectator: true });
      this.changed();
      return ok(null);
    }
    if (this.memberCount >= this.maxPlayers) return fail('This room is full');
    if (this.memberCount + this.bots >= this.game.maxPlayers) return fail('This room is full');
    this.members.push({ user, connected: true, left: false, absentSince: null });
    this.changed();
    return ok(null);
  }

  private lastBellAt = new Map<string, number>();

  /** Lobby: ring the bell. Everybody else in the room gets a nudge (shake + bell); a short cooldown keeps it fun. */
  bell(userId: string): Result<null> {
    const member = this.findSeated(userId);
    if (!member) return fail('You are not in this room');
    if (this.status !== 'lobby') return fail('You can only ring the bell in the lobby');
    const now = this.deps.now();
    if (now - (this.lastBellAt.get(userId) ?? -Infinity) < BELL_COOLDOWN_MS)
      return fail('Wait a moment before ringing the bell again');
    this.lastBellAt.set(userId, now);
    const bell: BellMessage = {
      fromId: userId,
      nickname: displayName(member.user),
      avatar: member.user.avatar,
      at: now,
    };
    // Everybody in the room, the ringer too (the client shakes only the others' screens).
    for (const m of this.members) if (!m.left && !m.bot) this.deps.emitBell(m.user.id, bell);
    return ok(null);
  }

  /** Voluntary leave. Mid-game the seat stays (auto-played) until the game ends. */
  leave(userId: string, reason: LeaveReason = 'left'): void {
    const member = this.members.find((m) => m.user.id === userId && !m.left && !m.bot);
    if (!member) return;
    if (this.status === 'playing' && !member.spectator) {
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
      const people = this.members.filter((m) => !m.bot && !m.spectator);
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
      nickname: displayName(member.user),
      avatar: member.user.avatar,
      text: this.deps.maskText(text),
      at: this.deps.now(),
    };
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY_LIMIT) this.messages.shift();
    for (const m of this.members) {
      if (!m.left && !m.bot) this.deps.emitChat(m.user.id, message);
    }
    this.deps.onChatSent?.({ code: this.code, gameId: this.game.id }, message);
    return ok(null);
  }

  sendHistory(userId: string): void {
    this.deps.emitHistory(userId, [...this.messages]);
  }

  // ---- public lobby -----------------------------------------------------------------------

  /** How this room appears in the public lobby list, or null if it should not be listed. */
  summary(): PublicRoomSummary | null {
    if (this.visibility !== 'public') return null;
    const playing = this.status === 'playing';
    if (this.status !== 'lobby' && !playing) return null;
    if (!playing) {
      if (this.memberCount >= this.maxPlayers) return null;
      if (this.memberCount + this.bots >= this.game.maxPlayers) return null;
    }
    const seats = this.members.filter((m) => !m.spectator && !m.left).length;
    const host = this.members.find((m) => m.user.id === this.hostId);
    return {
      code: this.code,
      status: playing ? 'playing' : 'lobby',
      spectators: this.spectatorCount,
      gameId: this.game.id,
      gameName: this.game.name,
      hostNickname: host ? displayName(host.user) : '',
      hostAvatar: host?.user.avatar ?? '',
      players: playing ? seats : this.memberCount,
      maxPlayers: playing ? seats : this.maxPlayers,
      createdAt: this.createdAt,
    };
  }

  /** Everything the admin panel shows about this room. */
  adminSummary(): AdminRoomRow {
    return {
      code: this.code,
      gameId: this.game.id,
      status: this.status,
      visibility: this.visibility,
      members: this.members
        .filter((m) => !m.left)
        .map((m) => ({
          id: m.user.id,
          nickname: displayName(m.user),
          bot: !!m.bot,
          connected: m.connected,
        })),
      host: displayName(
        this.members.find((m) => m.user.id === this.hostId)?.user ??
          ({ nickname: '?' } as PublicUser),
      ),
      spectators: this.spectatorCount,
      createdAt: this.createdAt,
      chatCount: this.messages.length,
    };
  }

  // ---- settings & lifecycle ----------------------------------------------------------------

  updateSettings(userId: string, patch: RoomSettingsInput): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can change settings');
    if (this.status !== 'lobby') return fail('Settings are locked once the game has started');

    if (patch.testDice !== undefined && patch.testDice !== this.testDice) {
      if (patch.testDice) {
        if (!this.members.find((m) => m.user.id === userId)?.user.isDev)
          return fail('Only developers can use test dice');
        if (this.game.id !== 'yatzy') return fail('Test dice are only for Yatzy');
      }
      this.testDice = patch.testDice;
    }
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
    if (patch.turnTimeSec !== undefined) {
      this.turnTimeSec = patch.turnTimeSec;
      this.turnTimeChosen = true;
    }
    // Everybody has to confirm the new settings again (except those who locked their Ready).
    this.resetReady();
    this.changed();
    return ok(null);
  }

  /**
   * Lobby: the host picks another game and everybody stays in the room ("persistent lobby": a group of
   * friends cycles through games without leaving). Options go back to the new game's defaults, computer
   * players are kept only if the new game has room for them, and everybody has to press Ready again.
   */
  setGame(userId: string, game: AnyGameDefinition): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can change the game');
    if (this.status !== 'lobby') return fail('The game can only be changed in the lobby');
    if (game.id === this.game.id) return ok(null);
    if (this.memberCount > game.maxPlayers) {
      return fail(`${game.name} supports at most ${game.maxPlayers} players`);
    }
    this.game = game;
    this.testDice = false;
    this.options = game.defaultOptions;
    this.maxPlayers = game.maxPlayers;
    this.bots = game.supportsBots ? Math.min(this.bots, game.maxPlayers - this.memberCount) : 0;
    this.resetReady();
    for (const m of this.members) m.suggestion = null; // the host chose: suggestions are done
    this.changed();
    return ok(null);
  }

  /**
   * Lobby: suggest a game for the next round (anybody, also non-hosts who cannot change it); everybody sees
   * it next to the suggester in the crew list. `null` takes the suggestion back.
   */
  suggest(userId: string, game: AnyGameDefinition | null): Result<null> {
    if (this.status !== 'lobby') return fail('The game has already started');
    const member = this.findSeated(userId);
    if (!member) return fail('You are not in this room');
    // Suggesting the game that is already chosen is pointless; suggesting the same one again withdraws it.
    member.suggestion =
      game && game.id !== this.game.id && member.suggestion !== game.id ? game.id : null;
    this.changed();
    return ok(null);
  }

  /**
   * The turn timer in force: playing a solo game alone (nobody else, no computers) there is no clock unless
   * somebody picked one, so a lone Yatzy game never auto-plays.
   */
  get turnTime(): number {
    if (this.game.ignoresTurnClock?.(this.options as never)) return 0;
    const alone = this.game.minPlayers <= 1 && this.bots === 0 && this.memberCount <= 1;
    return !this.turnTimeChosen && alone ? 0 : this.turnTimeSec;
  }

  /** Lobby: press or release Ready. When everybody is ready a short countdown starts the game. */
  setReady(userId: string, ready: boolean): Result<null> {
    if (this.status !== 'lobby') return fail('The game has already started');
    const member = this.findSeated(userId);
    if (!member) return fail('You are not in this room');
    member.ready = ready;
    if (!ready) member.readyLock = false; // cancelling Ready also unlocks it
    this.changed();
    return ok(null);
  }

  /**
   * Lobby: lock (or unlock) your Ready. A locked Ready stays on when the host changes a setting, picks
   * another game or the group comes back from a game, so a group can cycle through games quickly.
   */
  setReadyLock(userId: string, locked: boolean): Result<null> {
    // On the results screen a Ready lock can still be taken off ("Leave next match"), not put on.
    if (this.status !== 'lobby' && !(this.status === 'finished' && !locked))
      return fail('The game has already started');
    const member = this.findSeated(userId);
    if (!member) return fail('You are not in this room');
    member.readyLock = locked;
    if (locked) member.ready = true;
    this.changed();
    return ok(null);
  }

  /** A change everybody has to confirm: Ready goes off, except for people who locked it. */
  private resetReady(): void {
    for (const m of this.members) m.ready = !!m.readyLock;
  }

  /** When the next game starts by itself after this one (everybody locked Ready), or null. */
  private autoNextAt: number | null = null;

  /** Everybody still in the room has locked Ready: the games keep coming until somebody unlocks or leaves. */
  private autoNextEligible(): boolean {
    if (this.status !== 'finished') return false;
    const people = this.members.filter((m) => this.seated(m));
    return people.length > 0 && people.every((m) => m.readyLock);
  }

  /** Everybody present is ready and there are enough players (computer players count as seats). */
  private canAutoStart(): boolean {
    if (this.status !== 'lobby') return false;
    const people = this.members.filter((m) => this.seated(m));
    if (people.length === 0) return false;
    return (
      people.every((m) => m.connected && m.ready) &&
      people.length + this.bots >= this.game.minPlayers
    );
  }

  /** One person alone (a solo game) or with computer players: Ready is a plain Start, no countdown. */
  private get startsInstantly(): boolean {
    const alone = this.memberCount === 1;
    return alone && (this.bots > 0 || this.game.minPlayers <= 1);
  }

  private evaluateStart(): void {
    if (this.canAutoStart() && this.startsInstantly) this.startAt = null;
    else if (this.canAutoStart())
      this.startAt ??= this.deps.now() + (this.deps.limits.startCountdownMs ?? START_COUNTDOWN_MS);
    else this.startAt = null;
  }

  /** Host-only start (used by the "play the computer" create flow and tests; the lobby uses Ready). */
  start(userId: string): Result<null> {
    if (userId !== this.hostId) return fail('Only the host can start the game');
    return this.begin();
  }

  private begin(): Result<null> {
    if (this.status !== 'lobby') return fail('The game has already started');
    this.startAt = null;
    for (const m of this.members) m.suggestion = null; // the round starts: suggestions are done
    if (this.bots > 0 && !this.game.supportsBots) {
      return fail(`${this.game.name} cannot be played against the computer`);
    }
    // Computer players take the last seats; drop any left over from a previous game first.
    this.members = this.members.filter((m) => !m.bot && !m.left);
    this.members.push(...this.makeBots());
    const players = this.members
      .filter((m) => !m.spectator)
      .map((m) => ({
        id: m.user.id,
        nickname: displayName(m.user),
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

    this.state = this.game.createInitialState(players, this.options, this.rng);
    this.results = undefined;
    this.gameNo += 1;
    this.status = 'playing';
    this.nextAutoAt = null;
    this.startTurnClock();
    this.afterStateChange();
    return ok(null);
  }

  rematch(userId: string, toLobby = false): Result<null> {
    // Anybody in the room can take everyone back to the lobby; only the host restarts at once.
    if (!this.findSeated(userId)) return fail('You are not in this room');
    if (!toLobby && userId !== this.hostId) return fail('Only the host can start a rematch');
    if (this.status !== 'finished') return fail('The game is not finished');
    // Back to the waiting room: players who left and the computer players go away (the setting stays).
    this.members = this.members.filter((m) => !m.left && !m.bot);
    this.seatSpectators();
    this.resetReady();
    // The game may carry something over to the next one (e.g. a rule the winner picked).
    if (this.state && this.game.nextOptions)
      this.options = this.game.nextOptions(this.state, this.options);
    this.state = undefined;
    this.results = undefined;
    this.status = 'lobby';
    this.turnDeadline = null;
    this.nextAutoAt = null;
    // "Play again" (not toLobby): the host starts the next game at once, with the same people and computers.
    if (!toLobby && (this.game.restartOnRematch?.(this.options) ?? true) && this.start(userId).ok)
      return ok(null);
    this.changed();
    return ok(null);
  }

  /** Back in the lobby the watchers become players, as far as the room has seats (the rest go home). */
  private seatSpectators(): void {
    const seats = Math.min(this.maxPlayers, this.game.maxPlayers) - this.bots;
    for (const m of [...this.members]) {
      if (!m.spectator) continue;
      if (this.memberCount < seats) m.spectator = false;
      else {
        this.members = this.members.filter((x) => x !== m);
        this.deps.onMemberGone(this, m.user.id, 'left');
      }
    }
  }

  // ---- gameplay ---------------------------------------------------------------------------

  move(userId: string, rawMove: unknown): Result<null> {
    if (this.status !== 'playing') return fail('No game in progress');
    if (!this.hasMember(userId)) return fail('You are not in this game');
    if (!this.findSeated(userId)) return fail('You are watching this game');
    const parsed = this.game.moveSchema.safeParse(rawMove);
    if (!parsed.success) return fail('Invalid move');
    const check = this.game.validateMove(this.state, userId, parsed.data);
    if (!check.ok) return fail(check.error);

    const before = this.state;
    this.state = this.game.applyMove(this.state, userId, parsed.data, this.rng);
    // A free move (sharing which dice are kept) must not buy more time, and neither must a move in a
    // phase with one clock for everybody (the card swap).
    if (!this.game.isFreeMove?.(parsed.data) && !this.clockKept(before)) {
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
    const bonus = this.state ? (this.game.clockBonusMs?.(this.state) ?? 0) : 0;
    this.turnDeadline =
      this.turnTime > 0 ? this.turnStartedAt + this.turnTime * 1000 + bonus : null;
  }

  /** The game says the clock keeps running across the move that took `before` to the current state. */
  private clockKept(before: unknown): boolean {
    return !!this.state && !!this.game.keepsClock?.(before as never, this.state);
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
    if (this.testDice) return; // a developer's test game never counts
    const humans = this.members.filter((m) => !m.bot && !m.spectator).map((m) => m.user.id);
    try {
      this.deps.onGameFinished({
        gameId: this.game.id,
        matchId: `${this.code}-${this.gameNo}`,
        results,
        humans,
        players: humans.length + this.members.filter((m) => m.bot).length,
        bots: this.members.filter((m) => m.bot).length,
        roster: this.members
          .filter((m) => !m.spectator)
          .map((m) => ({
            id: m.user.id,
            nickname: displayName(m.user),
            avatar: m.user.avatar,
            bot: !!m.bot,
          })),
        detail: this.game.matchSummary?.(this.state) ?? null,
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
    const before = this.state;
    for (const id of this.game.getCurrentPlayers(this.state)) {
      const auto = autoMove.call(this.game, this.state, id, this.rng);
      this.state = this.game.applyMove(this.state, id, auto.move, this.rng);
      endsTurn = endsTurn && auto.endsTurn;
    }
    if (endsTurn) {
      this.nextAutoAt = null;
      if (!this.clockKept(before)) this.startTurnClock();
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
    if (!this.members.some((m) => this.seated(m) && m.connected)) return null;
    if (!this.currentMembers().some((m) => m.bot)) return null;
    const settle = this.state ? (this.game.settleMs?.(this.state) ?? 0) : 0;
    return this.lastChangeAt + Math.max(this.deps.limits.botMs, settle);
  }

  /** Every computer player who is up makes one move (they all act at once in simultaneous phases). */
  private playBots(): void {
    const autoMove = this.game.autoMove;
    if (!autoMove) return;
    const before = this.state;
    for (const id of this.game.getCurrentPlayers(this.state)) {
      if (!this.members.find((m) => m.user.id === id)?.bot) continue;
      const auto = autoMove.call(this.game, this.state, id, this.rng);
      this.state = this.game.applyMove(this.state, id, auto.move, this.rng);
      if (this.game.isGameOver(this.state)) break;
    }
    this.nextAutoAt = null;
    // The next person (if any) gets a fresh turn clock, unless the game keeps one clock for the phase.
    if (!this.clockKept(before)) this.startTurnClock();
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
      this.turnTime > 0 ? current.every((m) => this.isAbsent(m)) : current.every((m) => m.left);
    if (current.length > 0 && autoForAbsent) {
      const since = Math.max(this.turnStartedAt, ...current.map((m) => m.absentSince ?? 0));
      candidates.push(since + this.deps.limits.graceMs);
    }
    if (candidates.length === 0) return null;
    // A turn is only played for somebody (timeout, absent player) once the last move has finished animating.
    const settle = this.state ? (this.game.settleMs?.(this.state) ?? 0) : 0;
    return Math.max(Math.min(...candidates), this.lastChangeAt + settle);
  }

  private abandonedAt(): number | null {
    const people = this.members.filter((m) => !m.bot && !m.spectator);
    if (people.length === 0 || !people.every((m) => this.isAbsent(m))) return null;
    return Math.max(...people.map((m) => m.absentSince ?? 0)) + this.deps.limits.emptyTtlMs;
  }

  private nextWake(): number | null {
    const wakes: number[] = [];
    for (const m of this.members) {
      // A lobby drops anyone who stays away; a watcher who stays away is dropped in any state.
      if ((this.status === 'lobby' || m.spectator) && !m.connected && m.absentSince !== null) {
        wakes.push(m.absentSince + this.deps.limits.graceMs);
      }
    }
    if (this.status === 'lobby' && this.startAt !== null) wakes.push(this.startAt);
    if (this.status === 'finished' && this.autoNextAt !== null) wakes.push(this.autoNextAt);
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

    const gone = this.members.filter(
      (m) =>
        (this.status === 'lobby' || m.spectator) &&
        !m.connected &&
        m.absentSince !== null &&
        now >= m.absentSince + this.deps.limits.graceMs,
    );
    for (const m of gone) {
      this.members = this.members.filter((x) => x !== m);
      this.deps.onMemberGone(this, m.user.id, 'timeout');
      this.afterMembershipChange(m.user.id);
      if (this.destroyed) return;
    }

    // Everybody kept Ready locked: the next game follows the results by itself, without a stop in the lobby.
    if (this.status === 'finished' && this.autoNextAt !== null && now >= this.autoNextAt) {
      if (this.autoNextEligible() && this.rematch(this.hostId, true).ok) {
        if (this.canAutoStart() && this.begin().ok) return;
      }
      this.autoNextAt = null;
      this.changed();
      return;
    }

    if (this.status === 'lobby' && this.startAt !== null && now >= this.startAt) {
      if (this.canAutoStart() && this.begin().ok) return;
      // Could not start after all (e.g. someone dropped out): everybody has to ready up again.
      this.resetReady();
      this.startAt = null;
      this.changed();
      return;
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
      ...(this.testDice ? { testDice: true } : {}),
      ...(this.game.ignoresTurnClock?.(this.options as never) ? { noClock: true } : {}),
      options: this.options,
      turnTimeSec: this.turnTime,
      status: this.status,
      members: this.members
        .filter((m) => !m.spectator)
        .map((m) => ({
          id: m.user.id,
          nickname: displayName(m.user),
          avatar: m.user.avatar,
          connected: m.connected && !m.left,
          left: m.left,
          bot: !!m.bot,
          ready: !!m.bot || !!m.ready,
          readyLock: !m.bot && !!m.readyLock,
          suggestion: m.bot ? null : (m.suggestion ?? null),
        })),
      spectators: this.members
        .filter((m) => m.spectator && !m.left)
        .map((m) => ({
          id: m.user.id,
          nickname: displayName(m.user),
          avatar: m.user.avatar,
          connected: m.connected,
        })),
      ...(this.members.some((m) => m.spectator && m.user.id === forUserId)
        ? { spectating: true }
        : {}),
      startsAt: this.status === 'lobby' ? this.startAt : null,
      autoNextAt: this.status === 'finished' ? this.autoNextAt : null,
      serverTime: this.deps.now(),
    };
    if (this.status === 'lobby') return base;
    // While a computer player is thinking there is no human clock to show.
    const current = this.currentMembers();
    const onlyComputers = current.length > 0 && current.every((m) => m.bot);
    return {
      ...base,
      game: {
        // Watchers see the whole game, as somebody who is not playing: no private cards or ships.
        view: base.spectating
          ? (this.game.getSpectatorView ?? this.game.getPlayerView)(this.state, forUserId)
          : this.game.getPlayerView(this.state, forUserId),
        currentPlayers: this.game.getCurrentPlayers(this.state),
        deadline: onlyComputers ? null : (this.nextAutoAt ?? this.turnDeadline),
        results: this.results,
      },
    };
  }

  /** Push fresh state to everyone present and re-arm timers. Call after any change. */
  private changed(): void {
    if (this.status === 'finished') {
      this.autoNextAt = this.autoNextEligible()
        ? (this.autoNextAt ?? this.deps.now() + (this.deps.limits.autoNextMs ?? AUTO_NEXT_MS))
        : null;
    } else this.autoNextAt = null;
    if (this.status === 'lobby') {
      this.evaluateStart();
      if (this.canAutoStart() && this.startsInstantly && this.begin().ok) return;
    }
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
