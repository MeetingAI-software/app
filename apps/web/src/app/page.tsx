'use client';

import Link from 'next/link';

export default function Home() {
  const demoLink = "/s/demo"; // Placeholder — will be updated in Step 5 with the real production demo link
  const contactEmail = "hello@meetingai.eu";

  return (
    <main className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col items-center justify-center p-6 antialiased">
      <div className="w-full max-w-xl text-center space-y-8">
        <div className="space-y-4">
          <div className="inline-block bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-indigo-500/20">
            MeetingAI
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent leading-tight">
            Every meeting becomes a 90-second catch-up document
          </h1>
          <p className="text-gray-400 text-lg md:text-xl font-medium max-w-lg mx-auto">
            The instant, clean catch-up document for whoever missed it.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href={demoLink}
            className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] text-center"
          >
            See a real example
          </Link>
          
          <Link
            href="/meetings"
            className="w-full sm:w-auto px-6 py-3.5 bg-[#13171c] hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl font-semibold text-sm transition-all text-center"
          >
            Go to Console
          </Link>
        </div>

        <div className="pt-8 border-t border-gray-900/60">
          <p className="text-xs text-gray-600">
            Have questions? Contact us at <a href={`mailto:${contactEmail}`} className="text-gray-500 hover:text-gray-400 underline font-medium">{contactEmail}</a>
          </p>
        </div>
      </div>
    </main>
  );
}
