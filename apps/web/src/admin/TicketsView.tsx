import { useCallback, useEffect, useState } from 'react';
import { TICKET_STATUSES } from '@pogo/shared';
import type { TicketDetail, TicketRow, TicketStatus } from '@pogo/shared';
import { Button, Sheet } from '../components/ui';
import { getTicket, listTickets, patchTicket, queueTicket, ticketScreenshotUrl } from './adminApi';

const when = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  queued: 'Queued for Claude',
  in_progress: 'Claude is on it',
  fixed: 'Fixed',
  closed: 'Closed',
  wontfix: "Won't fix",
  duplicate: 'Duplicate',
};
const PRIORITY_COLOUR: Record<string, string> = {
  critical: 'bg-[#fd5f55] text-white',
  high: 'bg-[#fda200] text-[#101628]',
  medium: 'bg-[#3aaef7] text-[#101628]',
  low: 'bg-[#74cca8] text-[#101628]',
};
const badge = 'label rounded px-1.5 py-0.5 text-[10px]';

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="hud p-2" data-testid={`ticket-json-${title}`}>
      <summary className="label cursor-pointer">{title}</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px]">
        {JSON.stringify(value, null, 1)}
      </pre>
    </details>
  );
}

function TicketSheet({
  id,
  onClose,
  onChanged,
  onError,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setTicket(null);
    setShot(null);
    setCopied(false);
    if (!id) return;
    let url: string | null = null;
    getTicket(id)
      .then((t) => {
        setTicket(t);
        setNote(t.adminNote);
        if (t.hasScreenshot)
          void ticketScreenshotUrl(id).then((u) => {
            url = u;
            setShot(u);
          });
      })
      .catch((e: Error) => onError(e.message));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, onError]);

  const apply = (p: Parameters<typeof patchTicket>[1]) =>
    id &&
    patchTicket(id, p)
      .then((t) => {
        setTicket(t);
        onChanged();
      })
      .catch((e: Error) => onError(e.message));

  const fix = () => {
    if (!id) return;
    void queueTicket(id)
      .then(async (t) => {
        setTicket(t);
        onChanged();
        try {
          await navigator.clipboard.writeText(`/fix-ticket ${id}`);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      })
      .catch((e: Error) => onError(e.message));
  };

  const c = (ticket?.client ?? {}) as Record<string, unknown>;
  const b = (c.browser ?? {}) as { userAgent?: string; viewport?: { w: number; h: number } };
  const u = (c.user ?? {}) as { nickname?: string; isGuest?: boolean };
  return (
    <Sheet open={!!id} onClose={onClose} title="Ticket" full>
      {!ticket ? (
        <p className="label p-4 text-center">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="ticket-detail">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${badge} bg-white/15`}>
              {ticket.type === 'bug' ? '🐞 Bug' : '💬 Feedback'}
            </span>
            {ticket.priority && (
              <span className={`${badge} ${PRIORITY_COLOUR[ticket.priority]}`}>
                {ticket.priority}
              </span>
            )}
            <span className={`${badge} bg-white/15`}>{STATUS_LABEL[ticket.status]}</span>
            <span className="text-xs opacity-70">
              {ticket.nickname}
              {u.isGuest ? ' (guest)' : ''} · {when(ticket.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-md bg-white/5 p-3" data-testid="ticket-message">
            {ticket.message}
          </p>
          {shot && (
            <img
              src={shot}
              alt="Screenshot"
              className="max-h-96 w-full rounded-md border-2 border-edge/40 object-contain"
            />
          )}
          <div className="text-xs opacity-80">
            Screen: <b>{ticket.screen || '?'}</b>
            {ticket.gameId && (
              <>
                {' '}
                · game: <b>{ticket.gameId}</b>
              </>
            )}
            {typeof c.version === 'string' && <> · v{c.version}</>}
            {b.viewport && (
              <>
                {' '}
                · {b.viewport.w}×{b.viewport.h}
              </>
            )}
            {b.userAgent && <div className="mt-1 break-all opacity-70">{b.userAgent}</div>}
          </div>
          <div>
            <p className="label mb-1">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {TICKET_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`ticket-status-${s}`}
                  aria-pressed={ticket.status === s}
                  onClick={() => void apply({ status: s })}
                  className={`label min-h-9 rounded-md border-2 px-2 ${ticket.status === s ? 'border-accent bg-accent text-accentink' : 'border-edge/40'}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Note</span>
            <textarea
              value={note}
              rows={2}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== ticket.adminNote && void apply({ adminNote: note })}
              className="w-full rounded-md border-2 border-edge/40 bg-panel2 p-2 text-ink"
            />
          </label>
          {ticket.claudeNote && (
            <p className="rounded-md bg-white/5 p-2 text-xs" data-testid="ticket-claude-note">
              <b>Claude:</b> {ticket.claudeNote}
            </p>
          )}
          <Button data-testid="ticket-fix" variant="gold" onClick={fix}>
            Fix with Claude
          </Button>
          {copied && (
            <p className="label text-[10px]" data-testid="ticket-copied">
              Queued. <code>/fix-ticket {ticket.id}</code> is copied: paste it into Claude Code.
            </p>
          )}
          <Json title="client" value={ticket.client} />
          {ticket.server && <Json title="server" value={ticket.server} />}
        </div>
      )}
    </Sheet>
  );
}

/** The admin "Tickets" tab: bug reports and feedback, newest first. */
export function Tickets({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState<'open' | 'all' | TicketStatus>('open');
  const [type, setType] = useState<'all' | 'bug' | 'feedback'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    listTickets({
      ...(status === 'open' ? { open: true } : status === 'all' ? {} : { status }),
      ...(type === 'all' ? {} : { type }),
    })
      .then(setRows)
      .catch((e: Error) => onError(e.message));
  }, [status, type, onError]);
  useEffect(load, [load]);
  const chip = (on: boolean) =>
    `label min-h-9 rounded-md border-2 px-2 ${on ? 'border-accent bg-accent text-accentink' : 'border-onbg/40 text-onbg'}`;
  return (
    <div className="flex flex-col gap-3" data-testid="admin-tickets">
      <div className="flex flex-wrap gap-1.5">
        {(['open', 'all', ...TICKET_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={chip(status === s)}
            data-testid={`ticket-filter-${s}`}
            onClick={() => setStatus(s)}
          >
            {s === 'open' ? 'Open' : s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {(['all', 'bug', 'feedback'] as const).map((t) => (
          <button key={t} type="button" className={chip(type === t)} onClick={() => setType(t)}>
            {t === 'all' ? 'Bugs + feedback' : t === 'bug' ? 'Bugs' : 'Feedback'}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              data-testid={`ticket-row-${t.id}`}
              onClick={() => setOpenId(t.id)}
              className="hud flex w-full flex-col gap-1 p-3 text-left"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={`${badge} bg-white/15`}>{t.type === 'bug' ? '🐞' : '💬'}</span>
                {t.priority && (
                  <span className={`${badge} ${PRIORITY_COLOUR[t.priority]}`}>{t.priority}</span>
                )}
                <span className={`${badge} bg-white/15`}>{STATUS_LABEL[t.status]}</span>
                {t.hasScreenshot && <span aria-label="has a screenshot">📷</span>}
                <span className="ml-auto text-xs opacity-70">{when(t.createdAt)}</span>
              </span>
              <span className="line-clamp-2">{t.message}</span>
              <span className="text-xs opacity-70">
                {t.nickname} · {t.screen || '?'}
                {t.gameId ? ` · ${t.gameId}` : ''}
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="p-4 text-center opacity-70">No tickets here</li>}
      </ul>
      <TicketSheet id={openId} onClose={() => setOpenId(null)} onChanged={load} onError={onError} />
    </div>
  );
}
