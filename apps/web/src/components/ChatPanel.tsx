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
          className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200/50 rounded px-1.5 py-0.5 text-xs font-mono mx-0.5 align-baseline"
        >
          {timestamp[1]}
        </span>
      );
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
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
    <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 md:p-8 print:hidden shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/50 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
          Ask this meeting
        </span>
        {remaining !== null && (
          <span className="text-xs text-slate-500 font-semibold">
            {atCap ? 'No questions left' : `${remaining} question${remaining === 1 ? '' : 's'} left`}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 mb-5 font-medium">
        Answers come only from the transcript, with <span className="font-mono">[mm:ss]</span>{' '}
        citations. If something was not said, the assistant will tell you.
      </p>

      <div ref={scrollRef} className="space-y-4 max-h-[420px] overflow-y-auto mb-4 pr-1">
        {messages.length === 0 && !pending && (
          <p className="text-sm text-slate-500 italic font-medium">
            No questions yet. Try: what did we decide, or who owns the follow-up.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] text-sm font-medium shadow-sm'
                  : 'bg-slate-50 border border-slate-150 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm leading-relaxed font-medium shadow-sm'
              }
            >
              {m.role === 'assistant' ? renderAnswer(m.content) : m.content}
            </div>
          </div>
        ))}

        {pending && (
          <>
            <div className="flex justify-end">
              <div className="bg-indigo-650 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] text-sm font-medium shadow-sm">
                {pending}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-150 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm italic font-medium shadow-sm">
                Thinking…
              </div>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200/50 text-red-700 p-3 rounded-lg text-sm mb-4 font-medium">
          {error}
        </div>
      )}

      {atCap ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-500 text-center font-medium">
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
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/30 transition-all disabled:opacity-50 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-[#0F172A] hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg px-5 py-3 font-semibold text-sm transition-colors cursor-pointer shadow-sm"
          >
            {sending ? '…' : 'Ask'}
          </button>
        </form>
      )}
    </div>
  );
}
