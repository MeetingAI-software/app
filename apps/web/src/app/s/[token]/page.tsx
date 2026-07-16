'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getShare, type ShareResponse } from '@/lib/api';
import { msToClock } from '@/lib/format';
import DocumentView from '@/components/DocumentView';

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  useEffect(() => {
    fetchShareData();
  }, [token]);

  const fetchShareData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getShare(token);
      setShareData(res);
    } catch (err: any) {
      setError(err.message || 'Shared meeting not found');
    } finally {
      setLoading(false);
    }
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
          <p className="text-gray-400">Loading shared document...</p>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex items-center justify-center p-6">
        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Not Found</h1>
          <p className="text-gray-400 mb-6">{error || 'This link may have expired or is invalid.'}</p>
          <p className="text-xs text-gray-600">MeetingAI public portal</p>
        </div>
      </div>
    );
  }

  const { meeting, document, transcript } = shareData;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 p-4 md:p-8 flex flex-col justify-between print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto w-full flex-1">
        {/* Header Actions */}
        <div className="flex justify-between items-center mb-8 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 font-bold tracking-tight">MeetingAI Share</span>
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-[#13171c] hover:bg-gray-800 border border-gray-850 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5"
          >
            Print PDF
          </button>
        </div>

        {/* Meeting Overview Summary */}
        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 print:hidden">
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

        {/* Document Render */}
        <div className="bg-[#13171c] border border-gray-800 rounded-2xl overflow-hidden mb-8 print:border-none print:bg-white">
          {document ? (
            <DocumentView content={document.content} createdAt={document.createdAt} />
          ) : (
            <div className="p-12 text-center text-gray-400">
              No document generated yet for this meeting.
            </div>
          )}
        </div>

        {/* Transcript Accordion */}
        {transcript.length > 0 && (
          <div className="border border-gray-850 rounded-2xl overflow-hidden print:hidden bg-[#13171c]/30 mb-12">
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

      {/* Public Footer */}
      <footer className="w-full text-center border-t border-gray-900/80 pt-8 pb-4 print:hidden">
        <p className="text-xs text-gray-600">
          Generated automatically by <span className="font-semibold text-gray-400">MeetingAI</span> — The smart recording assistant.
        </p>
      </footer>
    </main>
  );
}
