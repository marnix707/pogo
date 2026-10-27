import { useEffect, useRef, useState } from 'react';
import type { DirectMessageView, PersonView } from '@pogo/shared';
import { Avatar, Button, Sheet } from '../components/ui';
import { PlayerName } from '../components/PlayerName';
import { useToast } from '../components/Toast';
import type { FriendsApi } from '../lib/friendsApi';

/** A private conversation with one friend: saved history, live new messages, a one-line send box. */
export function Thread({
  person,
  me,
  api,
  onDm,
  refresh,
  onClose,
}: {
  person: PersonView | null;
  me: string;
  api: FriendsApi;
  onDm: (fn: (m: DirectMessageView) => void) => () => void;
  refresh: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<DirectMessageView[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const id = person?.id ?? null;

  // Load the history when a thread opens and mark it read.
  useEffect(() => {
    setMessages([]);
    setText('');
    if (!id) return;
    api
      .messages(id)
      .then((r) => setMessages(r.messages))
      .catch((e: Error) => toast.show(e.message, 'error'));
    void api
      .read(id)
      .then(refresh)
      .catch(() => {});
  }, [api, id, refresh, toast]);

  // New messages of this conversation (also my own, sent from another tab).
  useEffect(() => {
    if (!id) return;
    return onDm((m) => {
      if (!((m.fromId === id && m.toId === me) || (m.fromId === me && m.toId === id))) return;
      setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
      if (m.fromId === id)
        void api
          .read(id)
          .then(refresh)
          .catch(() => {});
    });
  }, [api, id, me, onDm, refresh]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, id]);

  const send = async () => {
    const t = text.trim();
    if (!t || !id || busy) return;
    setBusy(true);
    try {
      const r = await api.send(id, t);
      setMessages((all) => (all.some((x) => x.id === r.message.id) ? all : [...all, r.message]));
      setText('');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!person} onClose={onClose} title="Message" full>
      {person && (
        <div className="flex h-full min-h-0 flex-col gap-3" data-testid="thread">
          <div className="flex items-center gap-3">
            <Avatar avatar={person.avatar} size="md" />
            <span className="truncate font-bold">
              <PlayerName name={person.name} />
            </span>
          </div>
          <div
            className="min-h-[40dvh] flex-1 overflow-y-auto rounded-lg bg-panel2/60 p-2"
            data-testid="thread-messages"
          >
            {messages.length === 0 && <p className="py-6 text-center text-muted">Say hi!</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`my-1 flex ${m.fromId === me ? 'justify-end' : 'justify-start'}`}
              >
                <span
                  data-testid={m.fromId === me ? 'dm-mine' : 'dm-theirs'}
                  className={`max-w-[80%] break-words rounded-lg px-3 py-1.5 text-sm ${
                    m.fromId === me ? 'bg-accent text-accentink' : 'bg-panel text-ink'
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              data-testid="thread-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="Write a message…"
              className="min-h-11 min-w-0 flex-1 rounded-md border-2 border-edge/50 bg-panel2 px-3 text-ink"
            />
            <Button
              type="submit"
              data-testid="thread-send"
              disabled={busy || !text.trim()}
              className="min-h-11 !px-4"
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </Sheet>
  );
}
