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
      <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-indigo-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-400">Loading meeting info...</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex items-center justify-center p-6">
        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Error Loading Meeting</h1>
          <p className="text-gray-400 mb-6">{error || 'Meeting not found'}</p>
          <Link href="/meetings" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors inline-block">
            Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  const isProcessing = ['pending', 'bot_joining', 'recording', 'processing'].includes(meeting.status);

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 p-4 md:p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto">
        {/* Back and Action header */}
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Link href="/meetings" className="text-indigo-400 hover:text-indigo-300 font-medium text-sm flex items-center gap-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Meetings
          </Link>

          <div className="flex gap-2">
            {meeting.status === 'transcribed' && (
              <>
                <button
                  onClick={handleCopyShare}
                  className="px-4 py-2 bg-[#13171c] hover:bg-gray-800 border border-gray-850 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5"
                >
                  {copied ? 'Copied ✓' : 'Share Link'}
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-[#13171c] hover:bg-gray-800 border border-gray-850 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5"
                >
                  Print PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Processing State Card */}
        {isProcessing && (
          <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 mb-8 text-center flex flex-col items-center">
            <div className="relative flex items-center justify-center mb-4">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Processing Meeting</h2>
            <p className="text-sm text-gray-400 max-w-sm mb-4">
              The bot is in the call or we are generating transcripts. Status is currently: <span className="font-semibold text-indigo-400 capitalize">{meeting.status.replace('_', ' ')}</span>
            </p>
            <p className="text-xs text-gray-600">Polled automatically every 3 seconds...</p>
          </div>
        )}

        {/* Failed State Card */}
        {meeting.status === 'failed' && (
          <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-8 mb-8 text-center">
            <div className="text-red-500 text-3xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-white mb-2">Meeting Processing Failed</h2>
            <p className="text-sm text-red-200/80 mb-4 max-w-md mx-auto">
              Error details: {meeting.errorMessage || 'No specific error message was reported.'}
            </p>
            <button onClick={fetchInitialData} className="px-4 py-2 bg-red-900 hover:bg-red-850 text-white text-sm font-semibold rounded-lg transition-colors">
              Retry Load
            </button>
          </div>
        )}

        {/* Transcribed State - Core Content */}
        {meeting.status === 'transcribed' && (
          <div className="space-y-8">
            {/* Auto-summary Card */}
            <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-6 md:p-8 print:hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
                  Summary
                </span>
              </div>
              {meeting.summary ? (
                <p className="text-gray-300 text-base leading-relaxed">{meeting.summary}</p>
              ) : (
                <p className="text-gray-500 text-sm italic">Summary is being generated...</p>
              )}
            </div>

            {/* Document Section */}
            <div className="bg-[#13171c] border border-gray-800 rounded-2xl overflow-hidden print:border-none print:bg-white">
              {!document ? (
                <div className="p-12 text-center print:hidden">
                  <h3 className="text-lg font-bold text-white mb-3">Meeting Notes Document</h3>
                  <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
                    A beautiful, structured document with missed takeaways, checkmarked decisions, action items, and open questions.
                  </p>
                  
                  {genError && (
                    <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-4 rounded-xl text-sm mb-6 max-w-md mx-auto">
                      {genError}
                    </div>
                  )}

                  <button
                    onClick={() => handleGenerateDoc(false)}
                    disabled={generating}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-750 disabled:bg-indigo-600/50 text-white font-semibold text-sm rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50"
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
                      className="px-3 py-1.5 bg-[#0d0f12] hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {generating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                  
                  {genError && (
                    <div className="mx-6 mt-6 bg-red-950/40 border border-red-900/50 text-red-300 p-4 rounded-xl text-sm mb-6 print:hidden">
                      {genError}
                    </div>
                  )}

                  <DocumentView content={document.content} createdAt={document.createdAt} />
                </div>
              )}
            </div>

            {/* Chat Panel — internal only, never on the public /s/[token] page */}
            <ChatPanel meetingId={meeting.id} />

            {/* Transcript Accordion */}
            {transcript.length > 0 && (
              <div className="border border-gray-850 rounded-2xl overflow-hidden print:hidden bg-[#13171c]/30">
                <button
                  onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                  className="w-full px-6 py-4 flex justify-between items-center hover:bg-gray-900/30 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-300">Transcript ({transcript.length} utterances)</span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${isAccordionOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isAccordionOpen && (
                  <div className="px-6 pb-6 pt-2 border-t border-gray-850/30 bg-[#0d0f12]/30 max-h-[400px] overflow-y-auto space-y-4">
                    {transcript.map((seg, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="flex gap-2 mb-1 items-center">
                          <span className="text-xs text-gray-500 font-mono">[{msToClock(seg.startMs)}]</span>
                          <span className="font-semibold text-indigo-400">{seg.speaker}</span>
                        </div>
                        <p className="text-gray-300 pl-4">{seg.text}</p>
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
