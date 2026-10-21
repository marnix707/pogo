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
  const transport = createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}
