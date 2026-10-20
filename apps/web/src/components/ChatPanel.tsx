import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@pogo/shared';
import type { ChatMessage, Result } from '@pogo/shared';
import { avatarEmoji } from '../lib/avatars';
import { haptic } from '../lib/haptics';

/** Message list + input. Used inline in the lobby and inside a sheet during games. */
export function ChatPanel({
  messages,
  me,
  online,
  onSend,
  heightClass = 'h-56',
}: {
  messages: ChatMessage[];
  me: string;
  online: boolean;
  onSend: (text: string) => Promise<Result<unknown>>;
  heightClass?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const res = await onSend(value);
    setSending(false);
    if (res.ok) {
      setText('');
      haptic('tap');
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="chat-panel">
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className={`hud flex flex-col gap-2 overflow-y-auto p-3 ${heightClass}`}
      >
        {messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-muted">No messages yet. Say hi! 👋</p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === me;
            return (
              <div
                key={m.id}
                data-testid="chat-message"
                className={`flex max-w-[88%] items-end gap-2 ${mine ? 'flex-row-reverse self-end' : 'self-start'}`}
              >
                {!mine && (
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-edge/60 bg-panel2 text-sm"
                  >
                    {avatarEmoji(m.avatar)}
                  </span>
                )}
                <div className={mine ? 'text-right' : ''}>
                  {!mine && <div className="label mb-0.5 text-[9px] text-muted">{m.nickname}</div>}
                  <div
                    className={`inline-block break-words rounded-md px-3 py-1.5 text-left text-sm ${
                      mine ? 'bg-accent text-accentink' : 'bg-panel2 text-ink'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          data-testid="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Say something nice…"
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          className="hud min-h-11 min-w-0 flex-1 bg-panel px-3 text-ink outline-none placeholder:text-muted/50 focus:!border-neon"
        />
        <button
          data-testid="chat-send"
          disabled={!online || sending || text.trim().length === 0}
          className="min-h-11 rounded-[8px] bg-accent px-4 text-sm font-bold uppercase tracking-[0.1em] text-accentink ring-2 ring-line shadow-[0_4px_0_0_#0067b8] active:translate-y-[2px] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
