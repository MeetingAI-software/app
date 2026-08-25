'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Meeting } from '@/lib/api';
import {
  avatarInitial,
  formatCardMeta,
  groupMeetingsByDay,
  meetingTitle,
  type FeedDayGroup,
} from '@/lib/feed';

/**
 * The console home's memo feed (SPEC §4).
 *
 * Measurements are taken from "01 Syncmemos Console (PRIMARY).dc.html". Cards link through to the
 * existing meeting page at /meetings/[id]; the redesigned detail page (design file 02) is a
 * separate job and is deliberately untouched here.
 *
 * Parts of the design that have no data behind them yet are left out rather than faked:
 * per-meeting thumbnails, comment counts and the "Get started" onboarding pill. See the notes at
 * each site below.
 */

const MATERIAL = 'material-symbols-outlined';

export default function MemoFeed({
  meetings,
  owner,
  loading,
  error,
}: {
  meetings: Meeting[];
  owner: string | null;
  loading: boolean;
  error: string | null;
}) {
  const groups = groupMeetingsByDay(meetings);

  // The scroll region itself is AppShell's <main>; this is SPEC §4's inner column.
  return (
    <div className="w-full max-w-[1000px] mx-auto pt-[4px] px-[44px] pb-[70px]">
      {error && <FeedNotice tone="error">{error}</FeedNotice>}
      {!error && loading && <FeedNotice>Loading your meetings…</FeedNotice>}
      {!error && !loading && meetings.length === 0 && (
        <FeedNotice>No meetings yet. Your memos will appear here once you record one.</FeedNotice>
      )}

      {/* SPEC §4.2: the entrance stagger is indexed across the whole feed, not per day group. */}
      <FeedGroups groups={groups} owner={owner} />
    </div>
  );
}

function FeedGroups({ groups, owner }: { groups: FeedDayGroup[]; owner: string | null }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  let cardIndex = 0;

  return (
    <>
      {groups.map((group, groupIndex) => {
        const isCollapsed = !!collapsed[group.key];
        const rows = group.meetings.map((meeting) => ({ meeting, index: cardIndex++ }));

        return (
          <section key={group.key}>
            <div className="flex items-center justify-between gap-[12px] pt-[28px] pb-[12px]">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-[6px] border-0 bg-transparent p-0 cursor-pointer font-[inherit] text-[var(--sm-ink)]"
              >
                <span className="text-[15px] font-semibold tracking-[-.01em]">{group.label}</span>
                <span
                  className={`${MATERIAL} text-[18px] text-[var(--sm-ink-2)] transition-transform duration-200`}
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
              </button>

              {/* SPEC §4.1: the filter shows on the first group only. There is no filtering
                  feature yet, so the control renders but does nothing. */}
              {groupIndex === 0 && (
                <button
                  type="button"
                  className="flex items-center gap-[5px] border-0 bg-transparent p-0 cursor-pointer font-[inherit] text-[14px] font-normal text-[var(--sm-ink)]"
                >
                  For you
                  <span className={`${MATERIAL} text-[18px] text-[var(--sm-ink-2)]`}>expand_more</span>
                </button>
              )}
            </div>

            {!isCollapsed && (
              <div className="flex flex-col gap-[11px]">
                {rows.map(({ meeting, index }) => (
                  <MemoCard key={meeting.id} meeting={meeting} owner={owner} index={index} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function MemoCard({
  meeting,
  owner,
  index,
}: {
  meeting: Meeting;
  owner: string | null;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = meeting.summary?.trim() || null;

  return (
    <div
      className="flex items-start gap-[15px]"
      style={{ animation: `smIn .4s ease ${(0.04 + index * 0.06).toFixed(2)}s both` }}
    >
      <span
        aria-hidden
        className="flex-none w-[34px] h-[34px] rounded-full grid place-items-center text-[18px] font-medium mt-[11px]"
        style={{ background: 'var(--sm-avatar)', color: 'var(--sm-avatar-fg)' }}
      >
        {avatarInitial(owner)}
      </span>

      <Link
        href={`/meetings/${meeting.id}`}
        className="group flex-1 min-w-0 flex items-start gap-[16px] px-[20px] py-[17px] rounded-[13px] cursor-pointer border border-[var(--sm-line)] hover:border-[var(--sm-line-strong)] hover:shadow-[var(--sm-sh-1)] transition-[border-color,box-shadow] duration-200"
        style={{ background: 'var(--sm-surface)' }}
      >
        <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
          <div className="text-[19px] font-medium tracking-[-.015em] leading-[1.2] text-[var(--sm-ink)] overflow-hidden text-ellipsis whitespace-nowrap">
            {meetingTitle(meeting)}
          </div>
          <div className="text-[12.5px] text-[var(--sm-ink-3)]">{formatCardMeta(meeting, owner)}</div>

          {summary && (
            <>
              <p
                className="mt-[9px] mb-0 text-[14px] leading-[1.5] text-[var(--sm-ink)] [text-wrap:pretty]"
                style={
                  expanded
                    ? undefined
                    : {
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }
                }
              >
                {summary}
              </p>
              <span
                role="button"
                tabIndex={0}
                // Inside a Link, so the card's navigation has to be suppressed explicitly.
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }}
                className="mt-[7px] w-fit text-[13.5px] text-[var(--sm-ink-2)] cursor-pointer hover:text-[var(--sm-ink)] hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </span>
            </>
          )}

          {/* SPEC §4.2 also specifies a comment pill and a 170×110 thumbnail. Neither has a
              data source: meetings carry no comment count and no image. They are left out
              rather than rendered with placeholder values on every card. */}
        </div>
      </Link>
    </div>
  );
}

function FeedNotice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <p
      className="mt-[28px] text-[14px] leading-[1.5]"
      style={{ color: tone === 'error' ? 'var(--sm-err-fg)' : 'var(--sm-ink-3)' }}
    >
      {children}
    </p>
  );
}
