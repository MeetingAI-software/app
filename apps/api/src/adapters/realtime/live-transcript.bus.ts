import { EventEmitter } from 'node:events';
import type { LiveTranscriptSegment } from '../../ports/repositories.port';
import type { MeetingStatus } from '../../domain/types';

/**
 * In-process fan-out from the Recall live webhook to the SSE connections watching a meeting.
 *
 * SINGLE INSTANCE ONLY. Publishers and subscribers must live in the same Node process, which
 * they do: the API runs as one long-lived server (Railway). If this ever scales horizontally,
 * a subscriber on node B would not see utterances ingested on node A — the answer then is the
 * cursor-polling endpoint (`GET /api/meetings/:id/live`), which reads from Postgres and is
 * already what the client falls back to. Do not reach for Redis before that stops being enough.
 */

export type LiveTranscriptEvent =
  /** A finalized utterance. Persisted, carries the `seq` cursor. */
  | { type: 'segment'; segment: LiveTranscriptSegment }
  /** An in-flight guess at what is being said right now. Never persisted, replaced constantly. */
  | { type: 'partial'; speaker: string; text: string }
  /** The meeting reached a terminal state — subscribers should close and refetch. */
  | { type: 'done'; status: MeetingStatus };

type Listener = (event: LiveTranscriptEvent) => void;

export class LiveTranscriptBus {
  // Node caps listeners at 10 per event by default and warns past that. One event name per
  // meeting means the cap is "viewers of a single meeting", which is a real limit, not a leak.
  private readonly emitter = new EventEmitter().setMaxListeners(50);

  publish(meetingId: string, event: LiveTranscriptEvent): void {
    this.emitter.emit(meetingId, event);
  }

  /** Returns the unsubscribe function; SSE handlers must call it on connection close. */
  subscribe(meetingId: string, listener: Listener): () => void {
    this.emitter.on(meetingId, listener);
    return () => {
      this.emitter.off(meetingId, listener);
    };
  }

  subscriberCount(meetingId: string): number {
    return this.emitter.listenerCount(meetingId);
  }

  /**
   * An SSE response never ends on its own, and `server.close()` waits for every connection to
   * drain — so without this a single open meeting page would hang every deploy until the
   * platform lost patience and SIGKILLed us mid-webhook. Shutdown asks the streams to end first.
   */
  onShutdown(close: () => void): () => void {
    this.closers.add(close);
    return () => {
      this.closers.delete(close);
    };
  }

  shutdown(): void {
    for (const close of this.closers) {
      try {
        close();
      } catch {
        // One stuck socket must not stop us from releasing the rest.
      }
    }
    this.closers.clear();
  }

  private readonly closers = new Set<() => void>();
}
