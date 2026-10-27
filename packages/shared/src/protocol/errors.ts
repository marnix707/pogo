/**
 * Error codes. Every error the app shows has a short code like `ROOM-101`, so a screenshot or a
 * message from a player is enough to find the cause. The text stays friendly; the code is shown
 * behind it, e.g. "Room not found (ROOM-101)".
 *
 * Areas: NET (requests, limits), SYS (server problems), MAIL (sending email), ACC (accounts and
 * sign-in), ADM (admin panel), ROOM (rooms, lobby, ready), GAME (any game), YAT (Yatzy), KAR (Karma), LAST (Last Card), SEA (Sea Battle).
 * Codes are `AREA-NNN`; 1xx = the player did something that is not allowed, 5xx = our side broke.
 *
 * To add an error: add a line to KNOWN_ERRORS (exact message, or a regex for messages with a game
 * name or number in them). `errors.test.ts` (server) fails when a message in the source has no code.
 */
export interface KnownError {
  code: string;
  /** The exact message, or a pattern for messages that contain names or numbers. */
  message: string | RegExp;
}

/** A message that is not in the catalogue yet. */
export const UNKNOWN_ERROR_CODE = 'SYS-000';
/** An unexpected server error (a bug, a crash, a database problem). */
export const INTERNAL_ERROR_CODE = 'SYS-500';
export const INTERNAL_ERROR_MESSAGE = 'Something went wrong on our side';

export const KNOWN_ERRORS: readonly KnownError[] = [
  // ---- NET: requests and limits ----
  { code: 'NET-001', message: 'Slow down a little' },
  { code: 'NET-002', message: 'You are sending messages too fast' },
  { code: 'NET-003', message: 'Too many attempts. Please wait a minute and try again.' },
  { code: 'NET-004', message: 'The server is busy, try again in a moment' },
  { code: 'NET-005', message: 'Invalid request' },
  { code: 'NET-006', message: 'Invalid input' },
  { code: 'NET-007', message: 'Invalid room code' },
  { code: 'NET-008', message: 'Invalid move' },
  { code: 'NET-009', message: 'Invalid room settings' },
  { code: 'NET-010', message: 'Invalid game options' },
  { code: 'NET-011', message: 'Not found' },

  // ---- SYS: our side ----
  { code: INTERNAL_ERROR_CODE, message: INTERNAL_ERROR_MESSAGE },
  { code: INTERNAL_ERROR_CODE, message: 'Something went wrong' },

  // ---- MAIL: sending email (the text is the same, the code tells what went wrong) ----
  { code: 'MAIL-001', message: "We couldn't send the email. Please try again in a minute." },
  { code: 'MAIL-005', message: 'No mail' },

  // ---- ACC: accounts and sign-in ----
  { code: 'ACC-101', message: 'Not signed in' },
  { code: 'ACC-102', message: 'Wrong email or password' },
  { code: 'ACC-103', message: 'Wrong password' },
  { code: 'ACC-104', message: 'You already have an account' },
  { code: 'ACC-105', message: /^That email already has an account/ },
  { code: 'ACC-106', message: 'That code is wrong or has expired' },
  { code: 'ACC-107', message: 'Nothing to merge' },
  { code: 'ACC-108', message: 'Register to upload a picture' },
  { code: 'ACC-109', message: 'Please upload a JPEG, PNG or WebP image' },
  { code: 'ACC-110', message: 'No picture' },
  { code: 'ACC-111', message: 'Please pick a different nickname' },
  { code: 'ACC-112', message: /^Nickname (must|can) be / },
  { code: 'ACC-113', message: /^Password must be / },
  { code: 'ACC-114', message: 'Please enter a valid email address' },
  { code: 'ACC-115', message: 'Enter the 6-digit code' },
  { code: 'ACC-120', message: /^You are banned / },

  // ---- ADM: admin panel ----
  { code: 'ADM-101', message: 'No access' },
  { code: 'ADM-102', message: 'Player not found' },
  { code: 'ADM-103', message: 'You cannot do that to yourself' },
  { code: 'ADM-104', message: 'You cannot act on someone of the same or a higher rank' },
  { code: 'ADM-105', message: 'Moderators can ban for 7 days at most' },
  { code: 'ADM-106', message: 'That ban is not active' },
  { code: 'ADM-107', message: 'Only admins can change roles' },
  { code: 'ADM-108', message: 'Invalid role' },
  { code: 'ADM-109', message: 'You cannot change your own role' },
  { code: 'ADM-110', message: 'Staff needs a registered account (to log in to the panel)' },
  { code: 'ADM-111', message: 'Only admins can give the dev tag' },
  { code: 'ADM-114', message: 'Only admins can create recovery links' },
  { code: 'ADM-115', message: 'Only guests can be recovered with a link' },
  { code: 'ADM-112', message: 'Only developers can do this' },
  { code: 'ADM-113', message: 'Only registered players can get titles' },

  // ---- ROOM: rooms, lobby, ready ----
  { code: 'ROOM-101', message: 'Room not found' },
  { code: 'ROOM-102', message: 'This room is full' },
  { code: 'ROOM-103', message: 'You were removed from this room' },
  { code: 'ROOM-104', message: 'You are not in a room' },
  { code: 'ROOM-105', message: 'You are not in this room' },
  { code: 'ROOM-106', message: 'Finish or leave your current game first' },
  { code: 'ROOM-107', message: 'This game has already started' },
  { code: 'ROOM-107', message: 'The game has already started' },
  { code: 'ROOM-108', message: 'No game in progress' },
  { code: 'ROOM-109', message: 'You are not in this game' },
  { code: 'ROOM-110', message: 'The game is not finished' },
  { code: 'ROOM-111', message: 'Only the host can change settings' },
  { code: 'ROOM-112', message: 'Only the host can remove players' },
  { code: 'ROOM-113', message: 'Only the host can start a rematch' },
  { code: 'ROOM-114', message: 'Only the host can start the game' },
  { code: 'ROOM-115', message: 'Settings are locked once the game has started' },
  { code: 'ROOM-116', message: 'There are already more players than that' },
  { code: 'ROOM-117', message: 'That player is not in the room' },
  { code: 'ROOM-118', message: 'You cannot remove yourself' },
  { code: 'ROOM-119', message: 'Too many players for this game' },
  { code: 'ROOM-120', message: /cannot be played against the computer$/ },
  { code: 'ROOM-121', message: /supports (at most )?\d+(-\d+)? players?$/ },
  { code: 'ROOM-122', message: / needs at least \d+ player/ },
  { code: 'ROOM-123', message: 'Unknown game' },
  { code: 'ROOM-124', message: 'Only the host can change the game' },
  { code: 'ROOM-126', message: 'Only developers can use test dice' },
  { code: 'ROOM-127', message: 'Test dice are only for Yatzy' },
  { code: 'ROOM-125', message: 'The game can only be changed in the lobby' },

  // ---- GAME: any game ----
  { code: 'GAME-101', message: 'Not your turn' },
  { code: 'GAME-102', message: 'The game is over' },

  // ---- YAT: Yatzy ----
  { code: 'YAT-101', message: 'Roll the dice first' },
  { code: 'YAT-102', message: 'No rolls left, pick a category' },
  { code: 'YAT-103', message: 'Invalid hold selection' },
  { code: 'YAT-104', message: 'Release at least one die to roll' },
  { code: 'YAT-105', message: 'Category not available' },
  { code: 'YAT-106', message: 'You have filled every box' },

  // ---- KAR: Karma ----
  { code: 'KAR-101', message: 'Swap cards and press Ready first' },
  { code: 'KAR-102', message: 'You are ready: no more swaps' },
  { code: 'KAR-103', message: 'You are already ready' },
  { code: 'KAR-104', message: 'That card is not in your hand' },
  { code: 'KAR-105', message: 'Pick one of your face-up cards' },
  { code: 'KAR-106', message: 'The swap phase is over' },
  { code: 'KAR-107', message: 'Pick up the pile first' },
  { code: 'KAR-108', message: 'There is nothing to pick up' },
  { code: 'KAR-109', message: 'Play your hand and face-up cards first' },
  { code: 'KAR-110', message: 'There is no card there' },
  { code: 'KAR-111', message: 'Pick one of your face-down cards' },
  { code: 'KAR-112', message: 'Pick each card once' },
  { code: 'KAR-113', message: 'Play your hand cards first' },
  { code: 'KAR-114', message: 'That card is not available' },
  { code: 'KAR-115', message: 'Play cards of the same rank' },
  { code: 'KAR-116', message: 'After a 7 you must play 7 or lower, or a 2 or a 10' },
  { code: 'KAR-117', message: 'Too low: play higher, or a 2 or a 10' },
  { code: 'KAR-118', message: 'The rules are being chosen' },
  { code: 'KAR-119', message: 'Only the last winner sets the rules' },
  { code: 'KAR-120', message: 'Pick one of the offered rules' },
  { code: 'KAR-121', message: 'There are no rules to choose now' },
  { code: 'KAR-122', message: 'Play the matching card or skip' },
  { code: 'KAR-123', message: 'Only the matching card can be played now' },
  { code: 'KAR-124', message: 'There is nothing to skip' },
  { code: 'KAR-126', message: 'Change one rule, or choose to skip' },
  { code: 'LAST-101', message: 'Too late: UNO! has to be called before the next player goes' },
  { code: 'LAST-108', message: 'Nobody can be called out right now' },
  { code: 'LAST-102', message: 'Play the card you drew, or pass' },
  { code: 'LAST-103', message: 'Draw a card first' },
  { code: 'LAST-104', message: 'That card does not match the pile' },
  {
    code: 'LAST-105',
    message: 'Answer with a Draw Two, Wild Draw Four or Shield, or draw the cards',
  },
  { code: 'LAST-109', message: 'A Shield only blocks a waiting draw penalty' },
  { code: 'LAST-106', message: 'You cannot finish with an action card: draw a card instead' },
  { code: 'LAST-107', message: 'Choose a colour for the wild card' },
  { code: 'LAST-125', message: /^Last Card needs \d+-\d+ players$/ },
  { code: 'KAR-125', message: /^Karma needs \d+-\d+ players$/ },
  { code: 'SEA-101', message: 'Place all five ships on the board without overlap' },
  { code: 'SEA-102', message: 'Your fleet is already in position' },
  { code: 'SEA-103', message: 'The battle has already started' },
  { code: 'SEA-104', message: 'The battle has not started yet' },
  { code: 'SEA-105', message: 'You already fired at that square' },
  { code: 'SEA-125', message: /^Sea Battle needs \d+-\d+ players$/ },
];

/** The code for an error message, or SYS-000 when the message is not in the catalogue. */
export function errorCodeFor(message: string): string {
  for (const known of KNOWN_ERRORS) {
    if (typeof known.message === 'string' ? known.message === message : known.message.test(message))
      return known.code;
  }
  return UNKNOWN_ERROR_CODE;
}

/** A failed result with its code (what `fail()` in the server builds). */
export const failResult = (error: string, extra: { code?: string; ref?: string } = {}) => ({
  ok: false as const,
  error,
  code: extra.code ?? errorCodeFor(error),
  ...(extra.ref ? { ref: extra.ref } : {}),
});

/** What is shown to the player: "Room not found (ROOM-101)", with a ref for server errors. */
export function formatError(error: string, code?: string, ref?: string): string {
  if (!code || error.includes(`(${code}`)) return error;
  return `${error} (${code}${ref ? ` · ${ref}` : ''})`;
}
