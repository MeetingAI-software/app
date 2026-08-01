'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLiveSegments, liveStreamUrl, type LiveSegment } from '@/lib/api';

export type LiveMode = 'connecting' | 'live' | 'reconnecting' | 'polling' | 'closed';

interface UseLiveTranscript {
  segments: LiveSegment[];
  /** The in-flight guess at what each speaker is saying right now. Replaced constantly. */
  partials: Record<string, string>;
  mode: LiveMode;
}

// EventSource reconnects on its own, so a couple of blips are normal and shouldn't be visible.
// Past this many in a row we stop trusting the transport and fall back to polling.
const FAILURES_BEFORE_POLLING = 3;
const POLL_INTERVAL_MS = 1500;

/**
 * Streams a meeting's live transcript over SSE, falling back to cursor polling if the stream
 * won't stay up. Both transports read the same rows keyed by the same `seq`, so switching
 * between them loses nothing and duplicates nothing.
 *
 * `onDone` fires when the server says the meeting reached a terminal state — the caller should
 * refetch the meeting and swap in the final transcript.
 */
export function useLiveTranscript(
  meetingId: string,
  enabled: boolean,
  onDone?: () => void,
): UseLiveTranscript {
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [partials, setPartials] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<LiveMode>('connecting');

  // The cursor lives in a ref, not state: the reconnect path reads it from inside an event
  // handler, and re-running the effect on every new segment would tear the connection down.
  const cursorRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const addSegments = useCallback((incoming: LiveSegment[]) => {
    if (incoming.length === 0) return;
    setSegments(prev => {
      const seen = new Set(prev.map(s => s.seq));
      const fresh = incoming.filter(s => !seen.has(s.seq));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh].sort((a, b) => a.seq - b.seq);
    });
    const highest = Math.max(...incoming.map(s => s.seq));
    if (highest > cursorRef.current) cursorRef.current = highest;
  }, []);

  useEffect(() => {
    if (!enabled || !meetingId) return;

    let closed = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let failures = 0;

    const finish = () => {
      if (closed) return;
      closed = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      setMode('closed');
      setPartials({});
      onDoneRef.current?.();
    };

    const startPolling = () => {
      if (closed || pollTimer) return;
      setMode('polling');
      // Partials only exist on the stream; clear them so a stale half-sentence doesn't linger.
      setPartials({});
      const tick = async () => {
        try {
          const res = await getLiveSegments(meetingId, cursorRef.current);
          addSegments(res.segments);
          if (res.status === 'transcribed' || res.status === 'failed') finish();
        } catch {
          // Keep polling: a single failed request is far more likely than the meeting vanishing.
        }
      };
      pollTimer = setInterval(tick, POLL_INTERVAL_MS);
      void tick();
    };

    const connect = () => {
      source = new EventSource(liveStreamUrl(meetingId, cursorRef.current), { withCredentials: true });

      source.addEventListener('open', () => {
        failures = 0;
        setMode('live');
      });

      source.addEventListener('segment', (event) => {
        const segment = JSON.parse((event as MessageEvent).data) as LiveSegment;
        addSegments([segment]);
        // The final text for this speaker has landed; drop the guess it replaced.
        setPartials(prev => {
          if (!(segment.speaker in prev)) return prev;
          const next = { ...prev };
          delete next[segment.speaker];
          return next;
        });
      });

      source.addEventListener('partial', (event) => {
        const { speaker, text } = JSON.parse((event as MessageEvent).data) as { speaker: string; text: string };
        setPartials(prev => (prev[speaker] === text ? prev : { ...prev, [speaker]: text }));
      });

      source.addEventListener('done', () => finish());

      source.addEventListener('error', () => {
        if (closed) return;
        failures += 1;
        if (failures >= FAILURES_BEFORE_POLLING) {
          source?.close();
          startPolling();
        } else {
          setMode('reconnecting');
        }
      });
    };

    // EventSource is missing in jsdom and in any browser old enough to matter; polling is a
    // complete substitute, so degrade rather than render an empty panel.
    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      connect();
    }

    return () => {
      closed = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [meetingId, enabled, addSegments]);

  return { segments, partials, mode };
}
