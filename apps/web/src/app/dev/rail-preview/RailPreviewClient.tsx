'use client';

import { useState } from 'react';
import Rail from '@/components/console/Rail';
import MemoFeed from '@/components/console/MemoFeed';
import type { Meeting, SubscriptionSummary, UsageSummary, User } from '@/lib/api';

/** Fixture data standing in for the API, chosen to reproduce the design's "1.4 / 4.0 h" card. */
const USER: User = {
  id: 'preview',
  email: 'meetingai@gmail.com',
  emailVerified: true,
  createdAt: new Date().toISOString(),
};

const USAGE: UsageSummary = { secondsUsed: 5040, secondsCap: 14400 };

const SUBSCRIPTION = {
  plan: 'free',
  status: 'none',
  hasPaidAccess: false,
  inRoomRecordingEnabled: false,
  entitlements: {
    monthlySecondsCap: 14400,
    maxMeetingSeconds: 3600,
    chatQuestionsPerMeeting: 5,
    phoneInRoomRecording: false,
    adminControlsAndAuditLog: false,
  },
  subscription: null,
} satisfies SubscriptionSummary;

/** Days are relative to today so the feed always shows a "Yesterday" group and an older one. */
function at(daysAgo: number, hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function fixture(overrides: Partial<Meeting>): Meeting {
  return {
    id: 'x',
    meetingUrl: 'Note',
    platform: 'zoom',
    status: 'transcribed',
    source: 'bot',
    botId: null,
    durationSeconds: 60,
    errorMessage: null,
    summary: null,
    shareToken: 'tok',
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: at(1, 15, 57),
    updatedAt: at(1, 15, 57),
    ...overrides,
  };
}

/** SPEC §4.3 — the prototype's exact feed copy, so the two can be compared side by side. */
const MEETINGS: Meeting[] = [
  fixture({
    id: 'n1',
    meetingUrl: 'AbdulRehman’s Meeting Notes',
    createdAt: at(1, 15, 57),
    durationSeconds: 60,
    summary:
      'Today’s meeting focused on marketing the app Sync Memos. Abdul introduced himself and Alper did the same, though there was confusion and frustration due to Alper’s disruption. The conversation was chaotic, with Abdul expressing anger over someone ruining his mood and asking Alper to stop interrupting. The purpose of the meeting was to discuss marketing strategies,',
  }),
  fixture({ id: 'n2', createdAt: at(1, 14, 17), durationSeconds: 7 }),
  fixture({ id: 'n3', createdAt: at(1, 14, 4), durationSeconds: 45 }),
  fixture({
    id: 'n4',
    meetingUrl: 'Learn how to use Syncmemos',
    createdAt: at(13, 20, 14),
    durationSeconds: 180,
    summary:
      'Charlie inquires about Syncmemos, a meeting summary tool, from Lisa, who has been using it for several months. Lisa explains that Syncmemos AI Chat allows her to ask questions across recorded conversations, including meetings and calls she was not able to attend in person.',
  }),
];

export default function RailPreviewClient({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <div className="sm-console h-screen flex overflow-hidden">
      <Rail
        user={USER}
        usage={USAGE}
        subscription={SUBSCRIPTION}
        collapsed={collapsed}
        onExpandRail={() => setCollapsed(false)}
        onLogout={() => {}}
      />

      <div className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--sm-bg)' }}>
        <div
          className="flex-none h-[60px] flex items-center gap-[12px] px-[18px]"
          style={{ background: 'var(--sm-surface)', borderBottom: '1px solid var(--sm-line)' }}
        >
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            aria-expanded={!collapsed}
            className="flex-none w-[32px] h-[32px] rounded-[9px] border-0 bg-transparent cursor-pointer grid place-items-center text-[var(--sm-ink-2)] transition-[background,color] duration-[160ms] hover:bg-[var(--sm-surface-2)] hover:text-[var(--sm-ink)]"
          >
            <span className="material-symbols-outlined text-[19px] leading-none">
              {collapsed ? 'left_panel_open' : 'left_panel_close'}
            </span>
          </button>
        </div>

        <main className="sm-scroll relative flex-1 min-h-0 overflow-y-auto">
          <MemoFeed
            meetings={MEETINGS}
            owner="AbdulRehman Khan"
            loading={false}
            error={null}
          />
        </main>
      </div>
    </div>
  );
}
