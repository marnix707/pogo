import { createTransport } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Rich version; clients that cannot show it use `text`. */
  html?: string;
  /** Inline images referenced from the html as `cid:<cid>`. */
  attachments?: { filename: string; content: Buffer; cid: string }[];
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Dev / tests: prints the mail to the log and remembers the last one per address. */
export interface LogMailer extends Mailer {
  last(to: string): Mail | undefined;
}

export function createLogMailer(log: (line: string) => void = console.log): LogMailer {
  const sent = new Map<string, Mail>();
  return {
    async send(mail) {
      sent.set(mail.to.toLowerCase(), mail);
      log(`[mail to ${mail.to}] ${mail.subject}: ${mail.text}`);
    },
    last: (to) => sent.get(to.toLowerCase()),
  };
}

/** Production: any SMTP server, e.g. `smtps://user:pass@smtp.example.com`. */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  // Timeouts so a blocked or silent server fails fast instead of hanging the request.
  const transport = createTransport({
    url: smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** "POGO <a@b.nl>" -> {name, email}; a bare address has no name. */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || undefined, email: m[2]!.trim() } : { email: from.trim() };
}

/**
 * Production on hosts that block SMTP (Render's free tier): Brevo's transactional API over HTTPS.
 * The API has no inline `cid:` images, so the artwork is loaded from `heroUrl` (our own site);
 * without one the image is left out.
 */
export function createBrevoMailer(
  apiKey: string,
  from: string,
  heroUrl = '',
  fetchImpl: typeof fetch = fetch,
): Mailer {
  const sender = parseFrom(from);
  return {
    async send(mail) {
      const hero = (html: string) =>
        heroUrl
          ? html.replaceAll('cid:hero', heroUrl)
          : html.replace(/<img[^>]*cid:hero[^>]*>/g, '');
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
          ...(mail.html ? { htmlContent: hero(mail.html) } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
  };
}
