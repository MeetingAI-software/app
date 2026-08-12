'use client';

import React from 'react';
import { PLANS, PricingPlan, getEffectiveMonthlyRateEur } from '@/lib/pricing';

interface PricingTableProps {
  isAnnual: boolean;
}

export function PricingTable({ isAnnual }: PricingTableProps) {
  const renderValue = (val: boolean | string) => {
    if (typeof val === 'boolean') {
      return val ? (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
          ✓
        </span>
      ) : (
        <span className="text-slate-300 font-medium">—</span>
      );
    }
    return <span className="text-slate-800 font-medium text-sm">{val}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 mt-20 mb-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Compare plan features in detail
        </h2>
        <p className="text-slate-600 mt-2 text-sm max-w-xl mx-auto">
          Every feature, limit, and security guardrail listed side-by-side. Powered by the same single source of truth.
        </p>
      </div>

      <div className="relative overflow-x-auto shadow-md rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left border-collapse">
          {/* Sticky Header Row */}
          <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-md">
            <tr>
              <th className="py-5 px-6 font-bold text-base w-1/3 sticky left-0 z-30 bg-slate-900 border-r border-slate-800">
                Features
              </th>
              {PLANS.map((plan) => {
                const price = isAnnual
                  ? getEffectiveMonthlyRateEur(plan.monthlyEur)
                  : plan.monthlyEur;
                return (
                  <th
                    key={plan.id}
                    className={`py-5 px-4 text-center w-1/6 border-r border-slate-800 last:border-r-0 ${
                      plan.id === 'team' ? 'bg-slate-800/90' : ''
                    }`}
                  >
                    <div className="font-bold text-lg">{plan.name}</div>
                    <div className="text-xs text-slate-300 font-normal mt-0.5">
                      €{price}
                      {plan.perSeat ? '/seat/mo' : '/mo'}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {/* Category: Recording */}
            <tr className="bg-slate-100/80">
              <th
                colSpan={5}
                className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-700 sticky left-0 bg-slate-100/80"
              >
                Recording
              </th>
            </tr>
            <Row
              title="Monthly recording time"
              getValue={(p) => p.features.monthlyHours}
            />
            <Row
              title="Max meeting length"
              getValue={(p) => p.features.maxMeetingLength}
            />
            <Row
              title="Zoom recording bot"
              getValue={(p) => p.features.zoomBot}
              renderVal={renderValue}
            />
            <Row
              title="In-room phone recording"
              getValue={(p) => p.features.phoneInRoomRecording}
              renderVal={renderValue}
            />

            {/* Category: The Document */}
            <tr className="bg-slate-100/80">
              <th
                colSpan={5}
                className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-700 sticky left-0 bg-slate-100/80"
              >
                The Document
              </th>
            </tr>
            <Row
              title="Structured executive summary"
              getValue={(p) => p.features.structuredDocument}
              renderVal={renderValue}
            />
            <Row
              title="Automated key takeaways"
              getValue={(p) => p.features.autoSummary}
              renderVal={renderValue}
            />
            <Row
              title="Utterance timestamps"
              getValue={(p) => p.features.timestamps}
              renderVal={renderValue}
            />
            <Row
              title="Shareable links"
              getValue={(p) => p.features.shareLinks}
              renderVal={renderValue}
            />
            <Row
              title="PDF & Print export"
              getValue={(p) => p.features.pdfPrintExport}
              renderVal={renderValue}
            />

            {/* Category: AI Chat */}
            <tr className="bg-slate-100/80">
              <th
                colSpan={5}
                className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-700 sticky left-0 bg-slate-100/80"
              >
                AI Chat
              </th>
            </tr>
            <Row
              title="AI questions per meeting"
              getValue={(p) => p.features.chatQuestionsPerMeeting}
            />
            <Row
              title="[mm:ss]-grounded answers"
              getValue={(p) => p.features.timestampGroundedAnswers}
              renderVal={renderValue}
            />

            {/* Category: Privacy & Security */}
            <tr className="bg-slate-100/80">
              <th
                colSpan={5}
                className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-700 sticky left-0 bg-slate-100/80"
              >
                Privacy & Security
              </th>
            </tr>
            <Row
              title="Automatic audio deletion after processing"
              getValue={(p) => p.features.autoAudioDeletion}
              renderVal={renderValue}
            />
            <Row
              title="Account & data erasure on demand"
              getValue={(p) => p.features.accountErasure}
              renderVal={renderValue}
            />
            <Row
              title="Admin controls & audit log"
              getValue={(p) => p.features.adminControlsAndAuditLog}
              renderVal={renderValue}
            />

            {/* Category: Support */}
            <tr className="bg-slate-100/80">
              <th
                colSpan={5}
                className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-700 sticky left-0 bg-slate-100/80"
              >
                Support
              </th>
            </tr>
            <Row
              title="Support tier"
              getValue={(p) => p.features.supportTier}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RowProps {
  title: string;
  getValue: (plan: PricingPlan) => boolean | string;
  renderVal?: (val: boolean | string) => React.ReactNode;
}

function Row({ title, getValue, renderVal }: RowProps) {
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="py-4 px-6 text-sm font-medium text-slate-900 sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200">
        {title}
      </td>
      {PLANS.map((plan) => {
        const val = getValue(plan);
        return (
          <td
            key={plan.id}
            className={`py-4 px-4 text-center border-r border-slate-100 last:border-r-0 ${
              plan.id === 'team' ? 'bg-blue-50/20' : ''
            }`}
          >
            {renderVal ? renderVal(val) : <span className="text-sm font-medium text-slate-800">{val}</span>}
          </td>
        );
      })}
    </tr>
  );
}
