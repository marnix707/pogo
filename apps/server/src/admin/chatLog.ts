import type { AdminChatRow, ChatMessage } from '@pogo/shared';

/** The latest room chat messages of every room (in memory only: rooms and their chats are not stored), for the admin panel. */
export class ChatLog {
  private rows: AdminChatRow[] = [];
  private nextId = 1;
  constructor(private readonly limit = 500) {}

  add(room: { code: string; gameId: string }, message: ChatMessage): void {
    this.rows.push({
      id: this.nextId++,
      at: message.at,
      roomCode: room.code,
      gameId: room.gameId,
      userId: message.userId,
      nickname: message.nickname,
      text: message.text,
    });
    if (this.rows.length > this.limit) this.rows.shift();
  }

  /** Newest first, optionally only one room / player / text. */
  recent(filter: { room?: string; user?: string; q?: string } = {}, max = 200): AdminChatRow[] {
    const q = filter.q?.toLowerCase();
    return this.rows
      .filter(
        (r) =>
          (!filter.room || r.roomCode === filter.room) &&
          (!filter.user || r.userId === filter.user) &&
          (!q || r.text.toLowerCase().includes(q) || r.nickname.toLowerCase().includes(q)),
      )
      .slice(-max)
      .reverse();
  }
}
