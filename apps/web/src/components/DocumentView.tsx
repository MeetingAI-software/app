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
    <article className="w-full max-w-[720px] mx-auto py-10 px-6 md:px-8 text-slate-900 antialiased bg-white rounded-lg shadow-sm border border-slate-200/85 print:shadow-none print:border-none print:p-0 print:max-w-full">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6 mb-8 print:pb-4 print:mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950 tracking-tight leading-tight mb-2 print:text-2xl">
          {content.title}
        </h1>
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
          Published on {formattedDate}
        </p>
      </header>

      {/* Missed5 - Hero Section */}
      <section className="mb-10 print:mb-8">
        <h2 className="font-label-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-slate-600">
          Key Takeaways (For Absentees)
        </h2>
        <div className="grid gap-3">
          {content.missed5.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-50/50 border border-slate-200/60 rounded-lg p-5 flex gap-4 items-start print:bg-white print:border-slate-300 print:p-4"
            >
              <span className="text-xl font-extrabold text-indigo-600 select-none leading-none shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed font-medium print:text-black">
                {item}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Decisions */}
      {content.decisions && content.decisions.length > 0 && (
        <section className="mb-10 border-t border-slate-200/80 pt-8 print:pt-6 print:mb-8">
          <h2 className="font-label-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-slate-600">
            Decisions Made
          </h2>
          <ul className="space-y-3">
            {content.decisions.map((decision, idx) => (
              <li key={idx} className="flex gap-3 items-start text-slate-700 print:text-black">
                <svg
                  className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm leading-relaxed font-medium">{decision}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action Points */}
      {content.actionPoints && content.actionPoints.length > 0 && (
        <section className="mb-10 border-t border-slate-200/80 pt-8 print:pt-6 print:mb-8">
          <h2 className="font-label-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-slate-600">
            Action Items
          </h2>
          <div className="grid gap-3">
            {content.actionPoints.map((ap, idx) => (
              <div
                key={idx}
                className="bg-slate-50/50 border border-slate-200/60 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:bg-white print:border-slate-300 print:p-3"
              >
                <span className="text-sm text-slate-700 print:text-black leading-relaxed font-medium">
                  {ap.task}
                </span>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {ap.owner && (
                    <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider print:border-slate-350 print:text-black">
                      {ap.owner}
                    </span>
                  )}
                  {ap.deadlineIso && (
                    <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider print:border-slate-350 print:text-black">
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
        <section className="border-t border-slate-200/80 pt-8 print:pt-6 print:page-break-inside-avoid">
          <h2 className="font-label-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-slate-600">
            Open Questions
          </h2>
          <ul className="space-y-3">
            {content.openQuestions.map((q, idx) => (
              <li key={idx} className="flex gap-3 items-start text-slate-600 print:text-black">
                <span className="text-indigo-600 font-bold text-lg leading-none mt-0.5">?</span>
                <span className="text-sm leading-relaxed font-medium">{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
