'use client';

import { useEffect, useState, useRef, Fragment } from 'react';
import { getChat, askChat, ApiError, type ChatMessage } from '@/lib/api';

/** Render "[mm:ss]" timestamps as subtle badges and **bold** as actual bold text. */
function renderAnswer(text: string) {
  const parts = text.split(/(\[\d{1,2}:\d{2}\]|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const timestamp = part.match(/^\[(\d{1,2}:\d{2})\]$/);
    if (timestamp) {
      return (
        <span
          key={i}
          className="inline-block bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded px-1.5 py-0.5 text-xs font-mono mx-0.5 align-baseline"
        >
          {timestamp[1]}
        </span>
      );
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-white">
          {bold[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function ChatPanel({ meetingId }: { meetingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null); // the question currently being answered
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    getChat(meetingId)
      .then((h) => {
        if (active) {
          setMessages(h.messages);
          setRemaining(h.remaining);
        }
      })
      .catch(() => {
        // History is best-effort; an empty panel is a fine starting state.
      });
    return () => {
      active = false;
    };
  }, [meetingId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const atCap = remaining !== null && remaining <= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending || atCap) return;

    setSending(true);
    setError(null);
    setPending(question);
    setInput('');

    try {
      const res = await askChat(meetingId, question);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: res.answer },
      ]);
      setRemaining(res.remaining);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setRemaining(0);
        setError('Question limit reached for this meeting.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('Transcript is not ready yet.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
      setInput(question); // let them retry without retyping
    } finally {
      setPending(null);
      setSending(false);
    }
  }

  return (
    <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-6 md:p-8 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
          Ask this meeting
        </span>
        {remaining !== null && (
          <span className="text-xs text-gray-500">
            {atCap ? 'No questions left' : `${remaining} question${remaining === 1 ? '' : 's'} left`}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-5">
        Answers come only from the transcript, with <span className="font-mono">[mm:ss]</span>{' '}
        citations. If something was not said, the assistant will tell you.
      </p>

      <div ref={scrollRef} className="space-y-4 max-h-[420px] overflow-y-auto mb-4 pr-1">
        {messages.length === 0 && !pending && (
          <p className="text-sm text-gray-600 italic">
            No questions yet. Try: what did we decide, or who owns the follow-up.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] text-sm'
                  : 'bg-[#0d0f12] border border-gray-800 text-gray-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm leading-relaxed'
              }
            >
              {m.role === 'assistant' ? renderAnswer(m.content) : m.content}
            </div>
          </div>
        ))}

        {pending && (
          <>
            <div className="flex justify-end">
              <div className="bg-indigo-600/70 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] text-sm">
                {pending}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-[#0d0f12] border border-gray-800 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm italic">
                Thinking…
              </div>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3 rounded-xl text-sm mb-4">
          {error}
        </div>
      )}

      {atCap ? (
        <div className="bg-[#0d0f12] border border-gray-800 rounded-xl p-4 text-sm text-gray-400 text-center">
          Question limit reached for this meeting.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            maxLength={500}
            placeholder="Ask about this meeting…"
            className="flex-1 bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-5 py-3 font-semibold text-sm transition-colors"
          >
            {sending ? '…' : 'Ask'}
          </button>
        </form>
      )}
    </div>
  );
}
