import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TICKET_PRIORITIES, formatError } from '@pogo/shared';
import type { TicketPriority, TicketType } from '@pogo/shared';
import { collectBugContext } from '../lib/diagnostics';
import { captureScreenshot } from '../lib/screenshot';
import { request } from '../lib/session';
import { BugIcon } from './icons';
import { useToast } from './Toast';
import { TileButton } from './TileButton';
import { Button, Sheet } from './ui';

interface BugApi {
  /** Takes a screenshot of the screen as it is, then opens the report. */
  open: () => void;
  busy: boolean;
}
const Ctx = createContext<BugApi>({ open: () => undefined, busy: false });
export const useBugReport = () => useContext(Ctx);

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** The bug / feedback form (a sheet), mounted once in `App`; every bar's bug button opens it. */
export function BugReportProvider({
  token,
  children,
}: {
  token: string | null;
  children: ReactNode;
}) {
  const toast = useToast();
  const [openSheet, setOpenSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [useShot, setUseShot] = useState(true);
  const [type, setType] = useState<TicketType>('bug');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  // (the state is taken when the button is pressed, so the report shows the screen the player was looking at)
  const [client, setClient] = useState<Record<string, unknown>>({});

  const open = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setClient(collectBugContext());
    void captureScreenshot().then((s) => {
      setShot(s);
      setUseShot(!!s);
      setBusy(false);
      setOpenSheet(true);
    });
  }, [busy]);
  const api = useMemo(() => ({ open, busy }), [open, busy]);

  const send = async () => {
    if (message.trim().length < 3) {
      toast.show('Please describe it in a few words', 'error');
      return;
    }
    setSending(true);
    try {
      await request(
        'POST',
        '/api/tickets',
        token,
        {
          type,
          ...(type === 'bug' ? { priority } : {}),
          message: message.trim(),
          ...(useShot && shot ? { screenshot: shot } : {}),
          client,
        },
        'Could not send the report',
      );
      toast.show(type === 'bug' ? 'Thanks! Bug report sent.' : 'Thanks for the feedback!');
      setMessage('');
      setOpenSheet(false);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : formatError('Could not send the report'),
        'error',
      );
    } finally {
      setSending(false);
    }
  };

  const chip = (active: boolean) =>
    `label min-h-10 flex-1 rounded-md border-2 px-2 ${
      active ? 'border-accent bg-accent text-accentink' : 'border-edge/40 text-muted'
    }`;
  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={openSheet} onClose={() => setOpenSheet(false)} title="Bug or feedback">
        <div className="flex flex-col gap-3" data-testid="bug-form">
          <div className="flex gap-2" role="group" aria-label="Type">
            <button
              type="button"
              data-testid="bug-type-bug"
              aria-pressed={type === 'bug'}
              className={chip(type === 'bug')}
              onClick={() => setType('bug')}
            >
              🐞 Bug
            </button>
            <button
              type="button"
              data-testid="bug-type-feedback"
              aria-pressed={type === 'feedback'}
              className={chip(type === 'feedback')}
              onClick={() => setType('feedback')}
            >
              💬 Feedback
            </button>
          </div>
          {type === 'bug' && (
            <div>
              <p className="label mb-1">How bad is it?</p>
              <div className="flex gap-2" role="group" aria-label="Priority">
                {TICKET_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-testid={`bug-priority-${p}`}
                    aria-pressed={priority === p}
                    className={chip(priority === p)}
                    onClick={() => setPriority(p)}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="label">
              {type === 'bug' ? 'What went wrong?' : 'What would you like to tell us?'}
            </span>
            <textarea
              data-testid="bug-message"
              value={message}
              maxLength={2000}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === 'bug'
                  ? 'What did you do, what did you expect, what happened?'
                  : 'Ideas, things you like, things you miss ...'
              }
              className="w-full rounded-md border-2 border-edge/40 bg-panel2 p-2 text-ink"
            />
          </label>
          {shot ? (
            <div data-testid="bug-shot">
              <div className="mb-1 flex items-center justify-between">
                <span className="label">Screenshot</span>
                <button
                  type="button"
                  data-testid="bug-shot-toggle"
                  onClick={() => setUseShot((v) => !v)}
                  className="label underline"
                >
                  {useShot ? 'Do not send it' : 'Send it'}
                </button>
              </div>
              <img
                src={shot}
                alt="Screenshot of your screen"
                className={`max-h-52 w-full rounded-md border-2 border-edge/40 object-contain ${useShot ? '' : 'opacity-30'}`}
              />
            </div>
          ) : (
            <p className="label text-[10px] text-muted">
              No screenshot could be taken. The report still carries the state of your game.
            </p>
          )}
          <p className="label text-[10px] text-muted">
            This sends what you wrote, the screenshot and the state of your screen and game to the
            Pogo team.
          </p>
          <Button
            data-testid="bug-send"
            variant="gold"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Sheet>
    </Ctx.Provider>
  );
}

/** The bug icon for a top bar (next to Settings). */
export function BugButton({
  small = false,
  className = '',
}: {
  small?: boolean;
  className?: string;
}) {
  const { open, busy } = useBugReport();
  return (
    <TileButton
      small={small}
      onClick={open}
      aria-label="Report a bug or send feedback"
      data-testid="bug-button"
      disabled={busy}
      className={`${busy ? 'opacity-60' : ''} ${className}`}
    >
      <BugIcon className="h-5 w-5" />
    </TileButton>
  );
}

/** For the sign-in screen, which has no bar: a small text link. */
export function BugLink() {
  const { open, busy } = useBugReport();
  return (
    <button
      type="button"
      data-testid="bug-link"
      disabled={busy}
      onClick={open}
      className="label mx-auto text-[10px] text-onbg/70 underline"
    >
      Report a bug
    </button>
  );
}
