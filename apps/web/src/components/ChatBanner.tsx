import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@pogo/shared';
import { avatarEmoji } from '../lib/avatars';

const SHOW_MS = 3600;

/**
 * A new chat message from somebody else slides down from the top like a phone notification: one
 * line in a bar as high as the header, cut off with "…" when it is too long. Tap to dismiss.
 */
export function ChatBanner({ messages, me }: { messages: ChatMessage[]; me: string }) {
  const [shown, setShown] = useState<ChatMessage | null>(null);
  // History that is already there (joining a room) is not announced: only a message appended to
  // what was shown before, or the very first message of a room when it is fresh.
  const prevLastId = useRef(messages[messages.length - 1]?.id ?? 0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.id <= prevLastId.current) return;
    const appended =
      prevLastId.current > 0 || (messages.length === 1 && Date.now() - last.at < 20_000);
    prevLastId.current = last.id;
    if (!appended || last.userId === me) return;
    clearTimeout(timer.current);
    setShown(last);
    timer.current = setTimeout(() => setShown(null), SHOW_MS);
  }, [messages, me]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!shown) return null;
  return (
    <button
      key={shown.id}
      type="button"
      data-testid="chat-banner"
      onClick={() => setShown(null)}
      className="chat-banner fixed inset-x-0 top-0 z-[60] flex h-[calc(env(safe-area-inset-top)+3.5rem)] items-center gap-3 border-b-2 border-neon bg-panel px-4 pt-[env(safe-area-inset-top)] text-left text-ink shadow-lg"
    >
      <span className="shrink-0 text-2xl leading-none" aria-hidden>
        {avatarEmoji(shown.avatar)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <b className="text-neon">{shown.nickname}</b> {shown.text}
      </span>
    </button>
  );
}
