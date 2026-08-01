'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  getMeeting,
  getTranscript,
  getDocument,
  generateDocument,
  type Meeting,
  type TranscriptSegment,
  type Document,
} from '@/lib/api';
import { msToClock } from '@/lib/format';
import DocumentView from '@/components/DocumentView';
import ChatPanel from '@/components/ChatPanel';
import LiveTranscript from '@/components/LiveTranscript';

/**
 * The API stores a failure as `<sentence> (<provider_sub_code>)`. Nobody should have to read a
 * snake_case vendor code to find out why their meeting was not recorded, so the codes that are
 * actually actionable get plain English and a next step. Anything unrecognised falls through to
 * the raw message rather than being swallowed.
 */
const FAILURE_REASONS: Record<string, { title: string; detail: string }> = {
  meeting_not_found: {
    title: "We couldn't find that meeting",
    detail:
      'The link may be wrong, or the meeting had not started yet when the bot tried to join. Double-check the link and start again.',
  },
  meeting_link_invalid: {
    title: 'That meeting link was not valid',
    detail: 'Copy the join link directly from Zoom, Google Meet or Teams and start again.',
  },
  meeting_password_incorrect: {
    title: 'The meeting needed a password',
    detail: 'The bot could not get in. Use a join link that includes the password.',
  },
  meeting_requires_signin: {
    title: 'The meeting required a signed-in account',
    detail: 'The host has restricted the meeting to invited accounts, so the bot was blocked at the door.',
  },
  bot_denied_entry: {
    title: 'The bot was not let in',
    detail: 'Nobody admitted it from the waiting room. Someone in the call needs to admit the bot when it knocks.',
  },
  timeout_waiting_to_join: {
    title: 'The bot waited too long to be let in',
    detail: 'It gave up in the waiting room. Admit it sooner next time, or turn off the waiting room for this meeting.',
  },
  bot_kicked_from_call: {
    title: 'The bot was removed from the call',
    detail: 'Someone removed it before the meeting finished, so there is no complete recording.',
  },
  meeting_ended: {
    title: 'The meeting was already over',
    detail: 'The call had ended by the time the bot arrived.',
  },
  no_audio: {
    title: 'There was no audio to transcribe',
    detail: 'The bot joined but never heard anyone, so no transcript could be produced.',
  },
};

function describeFailure(errorMessage: string | null | undefined) {
  const code = errorMessage?.match(/\(([a-z0-9_]+)\)\s*$/i)?.[1];
  if (code && FAILURE_REASONS[code]) {
    return FAILURE_REASONS[code];
  }
  return {
    title: 'This meeting was not recorded',
    detail: errorMessage || 'The bot stopped before a transcript could be produced.',
  };
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [document, setDocument] = useState<Document | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Document generation state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Accordion state
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  // Copy share token flash state
  const [copied, setCopied] = useState(false);

  // Refs for tracking active polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchInitialData();

    return () => {
      stopPolling();
    };
  }, [id]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      const m = await getMeeting(id);
      setMeeting(m);

      if (m.status === 'transcribed') {
        // Load transcript and document if available
        fetchTranscriptAndDoc(m.id);
      } else if (m.status !== 'failed') {
        startPolling();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load meeting details');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reload the meeting without the full-screen spinner. The live stream calls this when the
   * server says the meeting is over; blanking the page at that moment would throw away the
   * transcript the user is reading before the finished view is ready to replace it.
   */
  const refreshMeeting = async () => {
    try {
      const m = await getMeeting(id);
      setMeeting(m);
      if (m.status === 'transcribed') {
        stopPolling();
        fetchTranscriptAndDoc(m.id);
      }
    } catch (err) {
      console.warn('Refresh after live stream ended failed:', err);
    }
  };

  const fetchTranscriptAndDoc = async (meetingId: string) => {
    try {
      const t = await getTranscript(meetingId);
      setTranscript(t);
    } catch (err) {
      console.warn('Transcript not loaded yet:', err);
    }

    try {
      const d = await getDocument(meetingId);
      setDocument(d);
    } catch (err) {
      console.warn('Document not generated yet:', err);
    }
  };

  const startPolling = () => {
    if (pollingRef.current) return;
    
    pollingRef.current = setInterval(async () => {
      try {
        const m = await getMeeting(id);
        setMeeting(m);

        if (m.status === 'transcribed') {
          stopPolling();
          fetchTranscriptAndDoc(m.id);
        } else if (m.status === 'failed') {
          stopPolling();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleGenerateDoc = async (regenerate = false) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await generateDocument(id, regenerate);
      setDocument(res.document);
    } catch (err: any) {
      setGenError(err.message || 'Failed to generate document');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyShare = () => {
    if (!meeting?.shareToken) return;
    const shareUrl = `${window.location.origin}/s/${meeting.shareToken}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-slate-950 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-500 font-medium">Loading meeting info...</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-transparent text-slate-900 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Error Loading Meeting</h1>
          <p className="text-slate-500 mb-6">{error || 'Meeting not found'}</p>
          <Link href="/meetings" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors inline-block font-semibold shadow-sm">
            Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing = ['pending', 'bot_joining', 'recording', 'processing'].includes(meeting.status);
  // Only a bot in a live call produces a live transcript. Uploads are transcribed after the fact.
  const isLiveCapable = meeting.source === 'bot';
  const failure = describeFailure(meeting.errorMessage);

  return (
    <main className="min-h-screen bg-transparent text-slate-950 py-10 px-4 md:px-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto">
        {/* Back and Action header */}
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Link href="/meetings" className="text-slate-600 hover:text-slate-900 font-semibold text-sm flex items-center gap-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Console
          </Link>

          <div className="flex gap-2">
            {meeting.status === 'transcribed' && (
              <>
                <button
                  onClick={handleCopyShare}
                  className="px-4 py-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {copied ? 'Copied ✓' : 'Share Link'}
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  Print PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* An upload has no bot and no live stream — it goes straight to processing, so the
            original status card is still the honest thing to show. */}
        {isProcessing && !isLiveCapable && (
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg p-8 mb-8 text-center flex flex-col items-center shadow-sm">
            <div className="relative flex items-center justify-center mb-4">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-slate-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-900"></span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Processing Meeting</h2>
            <p className="text-sm text-slate-600 max-w-sm mb-4">
              We are transcribing your recording. Status is currently:{' '}
              <span className="font-bold text-slate-900 capitalize">{meeting.status.replaceAll('_', ' ')}</span>
            </p>
            <p className="text-xs text-slate-500">This page updates itself — no need to refresh.</p>
          </div>
        )}

        {/* Live state. The transcript panel is mounted from the very first status — the stream
            opens while the bot is still knocking, so nothing said in the first seconds is lost.
            `processing` keeps it on screen because the final transcript is still minutes away. */}
        {isProcessing && isLiveCapable && (
          <div className="mb-8 space-y-4">
            {meeting.status === 'processing' && (
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg px-6 py-4 flex items-center gap-3 shadow-sm">
                <svg className="animate-spin h-4 w-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">The meeting has ended.</span>{' '}
                  Cleaning up the transcript and writing your summary — this usually takes a minute.
                </p>
              </div>
            )}

            <LiveTranscript
              meetingId={meeting.id}
              status={meeting.status}
              startedAt={meeting.createdAt}
              onFinished={refreshMeeting}
            />
          </div>
        )}

        {/* Failed State Card — terminal. Re-fetching cannot change the outcome, so the way
            forward is a new meeting, not a retry. */}
        {meeting.status === 'failed' && (
          <div className="bg-red-50 border border-red-200/50 rounded-lg p-8 mb-8 text-center shadow-sm">
            <div className="text-red-500 text-3xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-red-950 mb-2">{failure.title}</h2>
            <p className="text-sm text-red-700 mb-4 max-w-md mx-auto">{failure.detail}</p>
            <Link
              href="/meetings"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm inline-block"
            >
              Start a new meeting
            </Link>
          </div>
        )}

        {meeting.status === 'transcribed' && (
          <div className="space-y-8">
            {/* Auto-summary Card */}
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg p-6 md:p-8 print:hidden shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
                  Summary
                </span>
              </div>
              {meeting.summary ? (
                <p className="text-slate-700 text-base leading-relaxed">{meeting.summary}</p>
              ) : (
                <p className="text-slate-500 text-sm italic">Summary is being generated...</p>
              )}
            </div>

            {/* Document Section */}
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg overflow-hidden mb-8 print:border-none print:bg-white shadow-sm">
              {!document ? (
                <div className="p-12 text-center print:hidden">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Meeting Notes Document</h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                    A beautiful, structured document with missed takeaways, checkmarked decisions, action items, and open questions.
                  </p>
                  
                  {genError && (
                    <div className="bg-red-50 border border-red-200/50 text-red-700 p-4 rounded-lg text-sm mb-6 max-w-md mx-auto font-medium">
                      {genError}
                    </div>
                  )}

                  <button
                    onClick={() => handleGenerateDoc(false)}
                    disabled={generating}
                    className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900/50 text-white font-semibold text-sm rounded-lg transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {generating ? 'Writing your document — up to 30 seconds...' : 'Generate Document'}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute top-6 right-6 print:hidden flex gap-2">
                    <button
                      onClick={() => handleGenerateDoc(true)}
                      disabled={generating}
                      className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {generating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                  
                  {genError && (
                    <div className="mx-6 mt-6 bg-red-50 border border-red-200/50 text-red-700 p-4 rounded-lg text-sm mb-6 print:hidden font-medium">
                      {genError}
                    </div>
                  )}

                  <DocumentView content={document.content} createdAt={document.createdAt} />
                </div>
              )}
            </div>

            {/* Chat Panel */}
            <ChatPanel meetingId={meeting.id} />

            {/* Transcript Accordion */}
            {transcript.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden print:hidden bg-white/80 backdrop-blur-sm mb-12 shadow-sm">
                <button
                  onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                  className="w-full px-6 py-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <span className="text-sm font-semibold text-slate-700">Transcript ({transcript.length} utterances)</span>
                  <svg
                    className={`w-5 h-5 text-slate-500 transform transition-transform ${isAccordionOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isAccordionOpen && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-200 bg-slate-50/30 max-h-[400px] overflow-y-auto space-y-4">
                    {transcript.map((seg, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="flex gap-2 mb-1 items-center">
                          <span className="text-xs text-slate-400 font-mono">[{msToClock(seg.startMs)}]</span>
                          <span className="font-semibold text-slate-900">{seg.speaker}</span>
                        </div>
                        <p className="text-slate-600 pl-4">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
