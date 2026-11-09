import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PLAYER_STATUS_LABEL, TICKET_PRIORITIES, formatError } from '@pogo/shared';
import type { MyTicket, TicketPriority, TicketStatus, TicketType } from '@pogo/shared';
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
  /** My reports whose status or type changed since I last looked (the red dot). */
  unread: number;
}
const Ctx = createContext<BugApi>({ open: () => undefined, busy: false, unread: 0 });
export const useBugReport = () => useContext(Ctx);

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const POLL_MS = 120_000;
const STATUS_TONE: Record<TicketStatus, string> = {
  new: 'bg-white/15',
  triaged: 'bg-[#3aaef7]/40',
  queued: 'bg-[#fda200]/50',
  in_progress: 'bg-[#fda200]/50',
  fixed: 'bg-[#56a786]/60',
  closed: 'bg-white/10 opacity-80',
  wontfix: 'bg-[#e8554a]/40',
  duplicate: 'bg-white/10 opacity-80',
};
const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 2) return 'just now';
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
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
  // "My reports": what I sent and where it stands; the red dot counts changes I have not looked at yet
  const [tab, setTab] = useState<'send' | 'mine'>('send');
  const [mine, setMine] = useState<MyTicket[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const loadMine = useCallback(async () => {
    if (!token) return null;
    try {
      const r = await request<{ tickets: MyTicket[]; unread: number }>(
        'GET',
        '/api/tickets/mine',
        token,
      );
      setMine(r.tickets);
      setUnread(r.unread);
      return r;
    } catch {
      return null; // (a missed check is not worth bothering anybody: the next one comes)
    }
  }, [token]);
  // Look now, when the app comes back to the front, and every couple of minutes while it is open.
  useEffect(() => {
    if (!token) {
      setMine(null);
      setUnread(0);
      return;
    }
    void loadMine();
    const tick = () => document.visibilityState === 'visible' && void loadMine();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [token, loadMine]);
  // Looking at the list marks everything seen; what was new stays highlighted while the list is open.
  useEffect(() => {
    if (!openSheet || tab !== 'mine' || !token) return;
    let gone = false;
    void loadMine().then((r) => {
      if (gone || !r) return;
      setFresh(new Set(r.tickets.filter((t) => t.unread).map((t) => t.id)));
      if (r.unread > 0)
        void request('POST', '/api/tickets/mine/seen', token).then(
          () => setUnread(0),
          () => undefined,
        );
    });
    return () => {
      gone = true;
    };
  }, [openSheet, tab, token, loadMine]);

  const open = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setClient(collectBugContext());
    // (a red dot means they came to see their reports)
    setTab(unread > 0 ? 'mine' : 'send');
    void captureScreenshot().then((s) => {
      setShot(s);
      setUseShot(!!s);
      setBusy(false);
      setOpenSheet(true);
    });
  }, [busy, unread]);
  const api = useMemo(() => ({ open, busy, unread }), [open, busy, unread]);

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
      void loadMine();
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
        {token && (
          <div className="mb-3 flex gap-2" role="tablist" aria-label="Reports">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'send'}
              data-testid="bug-tab-send"
              className={chip(tab === 'send')}
              onClick={() => setTab('send')}
            >
              Send a report
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'mine'}
              data-testid="bug-tab-mine"
              className={`${chip(tab === 'mine')} relative`}
              onClick={() => setTab('mine')}
            >
              My reports{mine && mine.length > 0 ? ` (${mine.length})` : ''}
              {unread > 0 && tab !== 'mine' && (
                <span
                  aria-label={`${unread} updated`}
                  data-testid="bug-tab-dot"
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#101628] bg-[#ff4b3e]"
                />
              )}
            </button>
          </div>
        )}
        {tab === 'mine' && token ? (
          <ul className="flex flex-col gap-2" data-testid="my-reports">
            {mine === null && <li className="label p-3 text-center">Loading…</li>}
            {mine?.length === 0 && (
              <li className="label p-3 text-center text-muted" data-testid="my-reports-empty">
                You have not sent anything yet.
              </li>
            )}
            {mine?.map((t) => (
              <li
                key={t.id}
                data-testid="my-report"
                data-status={t.status}
                data-fresh={fresh.has(t.id)}
                className={`rounded-md border-2 p-2.5 ${fresh.has(t.id) ? 'border-[#ff4b3e]' : 'border-edge/40'}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-base" aria-hidden>
                    {t.type === 'bug' ? '🐞' : '💬'}
                  </span>
                  <span
                    className={`label rounded px-1.5 py-0.5 text-[10px] ${STATUS_TONE[t.status]}`}
                  >
                    {PLAYER_STATUS_LABEL[t.status]}
                  </span>
                  {fresh.has(t.id) && (
                    <span className="label rounded bg-[#ff4b3e] px-1.5 py-0.5 text-[10px] text-white">
                      Updated
                    </span>
                  )}
                  <span className="ml-auto text-[10px] opacity-70">{ago(t.createdAt)}</span>
                </div>
                <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm leading-snug">
                  {t.message}
                </p>
              </li>
            ))}
          </ul>
        ) : (
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
        )}
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
  const { open, busy, unread } = useBugReport();
  return (
    <TileButton
      small={small}
      onClick={open}
      aria-label={
        unread > 0
          ? `Report a bug or send feedback (${unread} of your reports updated)`
          : 'Report a bug or send feedback'
      }
      data-testid="bug-button"
      disabled={busy}
      className={`${busy ? 'opacity-60' : ''} ${className}`}
    >
      <span className="relative">
        <BugIcon className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden
            data-testid="bug-dot"
            className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-[#101628] bg-[#ff4b3e]"
          />
        )}
      </span>
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
