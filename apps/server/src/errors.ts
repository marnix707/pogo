import { randomBytes } from 'node:crypto';

/** A short reference (6 letters/digits) that ties an error shown to a player to a server log line. */
export const newRef = (): string =>
  randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toLowerCase();

/**
 * An error we chose to report to the player: a status, a catalogue code (shared `errors.ts`) and a
 * friendly message. Anything else that is thrown becomes SYS-500.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

/**
 * Turns whatever the mailer threw into a coded error. The player always sees the same friendly
 * text; the code says what went wrong (the real cause is in the server log).
 *   MAIL-001 could not send (anything else)   MAIL-002 the provider refused our login / API key
 *   MAIL-003 the provider refused the mail (bad sender, bad address)   MAIL-004 unreachable / timeout
 *   MAIL-006 the provider says we send too much
 */
export function mailFailure(err: unknown): AppError {
  const text = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code ?? '';
  const brevo = /^Brevo (\d{3})/.exec(text);
  let mail = 'MAIL-001';
  if (brevo) {
    const status = Number(brevo[1]);
    mail =
      status === 401 || status === 403
        ? 'MAIL-002'
        : status === 429
          ? 'MAIL-006'
          : status >= 500
            ? 'MAIL-001'
            : 'MAIL-003';
  } else if (code === 'EAUTH') mail = 'MAIL-002';
  else if (code === 'EENVELOPE' || code === 'EMESSAGE') mail = 'MAIL-003';
  else if (
    ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(code) ||
    /timeout|aborted|fetch failed/i.test(text)
  )
    mail = 'MAIL-004';
  return new AppError(502, mail, "We couldn't send the email. Please try again in a minute.", {
    cause: err,
  });
}
