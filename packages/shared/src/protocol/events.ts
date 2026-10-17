export interface HelloMessage {
  message: string;
  serverTime: number;
}

export interface ServerToClientEvents {
  hello: (msg: HelloMessage) => void;
}

// Populated from milestone 3 onwards (room:*, game:move, chat:send).
export type ClientToServerEvents = Record<never, never>;
