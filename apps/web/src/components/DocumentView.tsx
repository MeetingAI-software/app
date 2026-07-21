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
    <article className="w-full max-w-[720px] mx-auto py-12 px-6 md:px-10 text-slate-900 antialiased bg-white rounded-lg shadow-sm border border-slate-200/60 print:shadow-none print:border-none print:p-0 print:max-w-full">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6 mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950 tracking-tight leading-tight mb-2">
          {content.title}
        </h1>
        <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">
          Published on {formattedDate}
        </p>
      </header>

      {/* Missed5 - Hero Section */}
      <section className="mb-10">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
          Key Takeaways (For Absentees)
        </h2>
        <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
          {content.missed5.map((item, idx) => (
            <div
              key={idx}
              className="py-4 flex gap-4 items-start"
            >
              <span className="font-mono text-sm font-bold text-indigo-600 shrink-0 w-6">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <p className="text-sm md:text-base text-slate-700 leading-relaxed font-medium">
                {item}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Decisions */}
      {content.decisions && content.decisions.length > 0 && (
        <section className="mb-10 border-t border-slate-200/60 pt-8">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
            Decisions Made
          </h2>
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
            {content.decisions.map((decision, idx) => (
              <div key={idx} className="py-4 flex gap-3 items-start text-slate-700">
                <svg
                  className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm md:text-base leading-relaxed font-medium">{decision}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Points */}
      {content.actionPoints && content.actionPoints.length > 0 && (
        <section className="mb-10 border-t border-slate-200/60 pt-8">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
            Action Items
          </h2>
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
            {content.actionPoints.map((ap, idx) => (
              <div
                key={idx}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></span>
                  <span className="text-sm md:text-base text-slate-700 leading-relaxed font-medium">
                    {ap.task}
                  </span>
                </div>
                {(ap.owner || ap.deadlineIso) && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0 pl-4 sm:pl-0">
                    {ap.owner && (
                      <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {ap.owner}
                      </span>
                    )}
                    {ap.deadlineIso && (
                      <span className="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Due: {ap.deadlineIso}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open Questions */}
      {content.openQuestions && content.openQuestions.length > 0 && (
        <section className="border-t border-slate-200/60 pt-8 print:page-break-inside-avoid">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
            Open Questions
          </h2>
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
            {content.openQuestions.map((q, idx) => (
              <div key={idx} className="py-4 flex gap-3 items-start text-slate-600">
                <span className="text-indigo-600 font-bold text-base leading-none mt-0.5 w-4 shrink-0">?</span>
                <span className="text-sm md:text-base leading-relaxed font-medium">{q}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
