import Link from 'next/link';

/**
 * Placeholder for cross-meeting AI Chat. Per-meeting chat already ships on the meeting detail
 * page (ChatPanel); this page is where asking across the whole workspace will live.
 */
export default function ChatPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-11 pt-1 pb-[70px]">
      <div className="pt-10 max-w-[560px]">
        <span className="relative inline-flex items-center justify-center w-11 h-11 rounded-full bg-emerald-500 overflow-hidden mb-5">
          <span className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_30%,#fff,transparent_60%)]" />
          <span className="flex gap-[6px] earth-eyes">
            <span className="w-[6px] h-[6px] rounded-full bg-white" />
            <span className="w-[6px] h-[6px] rounded-full bg-white" />
          </span>
        </span>

        <h1 className="text-[28px] font-semibold tracking-tight text-zinc-900 mb-2">AI Chat</h1>
        <p className="text-[15px] leading-relaxed text-zinc-500 mb-6">
          Ask questions across every meeting you&apos;ve recorded — decisions, owners, open threads —
          without opening them one by one. This is coming soon.
        </p>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[13.5px] text-zinc-700 mb-1.5 font-medium">Available today</p>
          <p className="text-[13.5px] text-zinc-500 leading-relaxed">
            Open any meeting and use the chat panel there to ask about that transcript.
          </p>
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1.5 mt-3 text-[13.5px] font-medium text-zinc-900 underline underline-offset-2"
          >
            Go to your meetings
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
