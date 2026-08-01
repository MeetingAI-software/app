'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveTranscript, type LiveMode } from '@/hooks/useLiveTranscript';
import { msToClock } from '@/lib/format';
import type { LiveSegment, MeetingStatus } from '@/lib/api';

interface Props {
  meetingId: string;
  status: MeetingStatus;
  startedAt: string;
  /** Called when the server reports the meeting is over, so the page can load the real transcript. */
  onFinished?: () => void;
}

interface Block {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  key: string;
}

// Recall finalizes an utterance every few seconds, so the same person speaking continuously
// arrives as many rows. Reading that as one paragraph per row is exhausting; anything under
// this gap from the same speaker is the same thought.
const SAME_BLOCK_GAP_MS = 15000;

function toBlocks(segments: LiveSegment[]): Block[] {
  const blocks: Block[] = [];
  for (const seg of segments) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === seg.speaker && seg.startMs - last.endMs <= SAME_BLOCK_GAP_MS) {
      last.text += ' ' + seg.text;
      last.endMs = Math.max(last.endMs, seg.endMs);
    } else {
      blocks.push({
        speaker: seg.speaker,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text,
        // Keyed on the seq that opened the block, so React reuses the node as it grows.
        key: `b${seg.seq}`,
      });
    }
  }
  return blocks;
}

const MODE_LABEL: Record<LiveMode, { text: string; tone: string }> = {
  connecting: { text: 'Connecting', tone: 'text-slate-500' },
  live: { text: 'Live', tone: 'text-red-600' },
  reconnecting: { text: 'Reconnecting', tone: 'text-amber-600' },
  polling: { text: 'Catching up', tone: 'text-amber-600' },
  closed: { text: 'Ended', tone: 'text-slate-500' },
};

export default function LiveTranscript({ meetingId, status, startedAt, onFinished }: Props) {
  // Keep streaming through `processing`: the meeting is over but the final transcript is still
  // minutes away, and the live text is all the user has to look at until then.
  const active = status !== 'transcribed' && status !== 'failed';
  const { segments, partials, mode } = useLiveTranscript(meetingId, active, onFinished);

  const blocks = useMemo(() => toBlocks(segments), [segments]);
  const partialEntries = useMemo(
    () => Object.entries(partials).filter(([, text]) => text.trim().length > 0),
    [partials],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Auto-scroll only while the user is already at the bottom. Yanking the view mid-sentence
  // because someone else started talking is the fastest way to make a live panel unusable.
  useLayoutEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, partialEntries, pinned]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const jumpToLive = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  };

  const elapsed = useElapsed(startedAt, active);
  const label = MODE_LABEL[mode];
  const isEmpty = blocks.length === 0 && partialEntries.length === 0;

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm overflow-hidden print:hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center h-3 w-3">
            {mode === 'live' && (
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                mode === 'live' ? 'bg-red-600' : mode === 'closed' ? 'bg-slate-400' : 'bg-amber-500'
              }`}
            />
          </span>
          <span className={`text-sm font-bold uppercase tracking-wider ${label.tone}`}>{label.text}</span>
          <span className="text-sm text-slate-400 font-mono tabular-nums">{elapsed}</span>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {status === 'processing' ? 'Meeting ended' : 'Live transcript'}
        </span>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="px-6 py-5 h-[460px] overflow-y-auto space-y-5 scroll-smooth"
        >
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-500 font-medium">
                {status === 'pending' || status === 'bot_joining'
                  ? 'The notetaker is joining the call…'
                  : 'Waiting for someone to speak…'}
              </p>
              <p className="text-xs text-slate-400 mt-1.5">Words will appear here as they are spoken.</p>
            </div>
          ) : (
            <>
              {blocks.map(block => (
                <div key={block.key} className="text-sm">
                  <div className="flex gap-2 mb-1 items-center">
                    <span className="text-xs text-slate-400 font-mono tabular-nums">[{msToClock(block.startMs)}]</span>
                    <span className="font-semibold text-slate-900">{block.speaker}</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed pl-4">{block.text}</p>
                </div>
              ))}

              {/* The provider's in-flight guess: shown greyed so it reads as "still settling",
                  and replaced in place the moment the finalized utterance arrives. */}
              {partialEntries.map(([speaker, text]) => (
                <div key={`partial-${speaker}`} className="text-sm">
                  <div className="flex gap-2 mb-1 items-center">
                    <span className="text-xs text-slate-300 font-mono">[--:--]</span>
                    <span className="font-semibold text-slate-400">{speaker}</span>
                  </div>
                  <p className="text-slate-400 italic leading-relaxed pl-4">
                    {text}
                    <span className="inline-block w-[2px] h-[1em] bg-slate-400 ml-1 align-text-bottom animate-pulse" />
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {!pinned && (
          <button
            onClick={jumpToLive}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-full shadow-lg transition-colors cursor-pointer"
          >
            ↓ Jump to live
          </button>
        )}
      </div>
    </div>
  );
}

/** Wall-clock time since the meeting was created; ticks only while the meeting is still open. */
function useElapsed(startedAt: string, active: boolean): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return '00:00';
  return msToClock(Math.max(0, now - started));
}
