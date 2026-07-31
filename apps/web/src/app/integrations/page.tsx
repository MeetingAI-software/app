/**
 * Placeholder for the integrations directory. Zoom bot recording and audio upload already work
 * through the meetings flow; these are the connections still to be wired up.
 */
const INTEGRATIONS = [
  { name: 'Zoom', icon: 'videocam', blurb: 'Send the notetaker bot to a Zoom link.', status: 'Live' },
  { name: 'Google Meet', icon: 'duo', blurb: 'Auto-join Meet calls from your calendar.', status: 'Planned' },
  { name: 'Google Calendar', icon: 'calendar_month', blurb: 'Record scheduled meetings automatically.', status: 'Planned' },
  { name: 'Slack', icon: 'forum', blurb: 'Post each recap to a channel when it lands.', status: 'Planned' },
  { name: 'Notion', icon: 'description', blurb: 'Sync catch-up documents into a database.', status: 'Planned' },
];

export default function IntegrationsPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-11 pt-1 pb-[70px]">
      <div className="pt-10">
        <h1 className="text-[28px] font-semibold tracking-tight text-zinc-900 mb-2">Integrations</h1>
        <p className="text-[15px] leading-relaxed text-zinc-500 mb-7 max-w-[560px]">
          Connect Syncmemos to where your meetings and notes already live. Most of these are still
          on the way — Zoom recording works today from the meetings page.
        </p>

        <div className="grid gap-[11px] sm:grid-cols-2">
          {INTEGRATIONS.map((it) => {
            const live = it.status === 'Live';
            return (
              <div
                key={it.name}
                className="flex items-start gap-3.5 px-5 py-[17px] bg-white border border-zinc-200 rounded-[13px]"
              >
                <span className="flex-none w-[34px] h-[34px] rounded-full bg-zinc-100 text-zinc-500 grid place-items-center">
                  <span className="material-symbols-outlined text-[19px]">{it.icon}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-medium text-zinc-900">{it.name}</span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        live
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                      }`}
                    >
                      {it.status}
                    </span>
                  </div>
                  <p className="text-[13px] text-zinc-500 leading-relaxed mt-0.5">{it.blurb}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
