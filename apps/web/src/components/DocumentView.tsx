import type { DocumentContent } from '@/lib/api';

interface DocumentViewProps {
  content: DocumentContent;
  createdAt: string;
}

export default function DocumentView({ content, createdAt }: DocumentViewProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article className="w-full max-w-[720px] mx-auto py-10 px-4 md:px-0 text-gray-200 antialiased print:text-black print:bg-white print:p-0 print:max-w-full">
      {/* Header */}
      <header className="border-b border-gray-800 pb-8 mb-10 print:border-black">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight print:text-black mb-3">
          {content.title}
        </h1>
        <p className="text-sm text-gray-400 print:text-gray-600 font-medium">
          Published on {formattedDate}
        </p>
      </header>

      {/* Missed5 - Hero Section */}
      <section className="mb-12">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-6 print:text-black print:text-sm">
          Key Takeaways (For Absentees)
        </h2>
        <div className="grid gap-4">
          {content.missed5.map((item, idx) => (
            <div
              key={idx}
              className="bg-[#13171c] border border-gray-800 rounded-xl p-5 flex gap-4 items-start print:bg-white print:border-black print:p-3"
            >
              <span className="text-2xl font-black text-indigo-500/30 select-none leading-none shrink-0 print:text-black">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <p className="text-base text-gray-200 leading-relaxed font-normal print:text-black">
                {item}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Decisions */}
      {content.decisions && content.decisions.length > 0 && (
        <section className="mb-12 border-t border-gray-800/50 pt-8 print:border-black">
          <h2 className="text-xs font-bold uppercase tracking-wider text-green-400 mb-5 print:text-black print:text-sm">
            Decisions Made
          </h2>
          <ul className="space-y-3">
            {content.decisions.map((decision, idx) => (
              <li key={idx} className="flex gap-3 items-start text-gray-300 print:text-black">
                <svg
                  className="w-5 h-5 text-green-500 shrink-0 mt-0.5 print:text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-base leading-relaxed">{decision}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action Points */}
      {content.actionPoints && content.actionPoints.length > 0 && (
        <section className="mb-12 border-t border-gray-800/50 pt-8 print:border-black">
          <h2 className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-5 print:text-black print:text-sm">
            Action Items
          </h2>
          <div className="grid gap-3">
            {content.actionPoints.map((ap, idx) => (
              <div
                key={idx}
                className="bg-[#13171c]/40 border border-gray-800/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:bg-white print:border-black print:p-2"
              >
                <span className="text-base text-gray-200 print:text-black leading-relaxed">
                  {ap.task}
                </span>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {ap.owner && (
                    <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-md font-semibold print:border-black print:text-black">
                      {ap.owner}
                    </span>
                  )}
                  {ap.deadlineIso && (
                    <span className="bg-gray-800 border border-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded-md font-semibold print:border-black print:text-black">
                      Due: {ap.deadlineIso}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open Questions */}
      {content.openQuestions && content.openQuestions.length > 0 && (
        <section className="border-t border-gray-800/50 pt-8 print:border-black print:page-break-inside-avoid">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-5 print:text-black print:text-sm">
            Open Questions
          </h2>
          <ul className="space-y-3">
            {content.openQuestions.map((q, idx) => (
              <li key={idx} className="flex gap-3 items-start text-gray-400 print:text-black">
                <span className="text-indigo-400 print:text-black font-semibold text-lg leading-none mt-0.5">?</span>
                <span className="text-base leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
