'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { BRAND_HIGHLIGHT } from '@/lib/brand';

/**
 * The landing page walkthrough: three steps from pasting a link to sending the memo.
 *
 * The hero's "See how it works" button scrolls here and replays it from step one, so this is the
 * page's answer to "what actually happens?". It ends by pointing at #demo, which shows the memo
 * those three steps produce.
 *
 * Everything inside the stage is revealed from the player's `progress` value rather than from its
 * own CSS animation. That keeps every reveal locked to the rail's progress bar, makes the whole
 * thing deterministic (progress 1 = the finished frame, which is also what the server renders and
 * what a visitor with reduced motion or no JS sees), and means clicking a step jumps cleanly
 * instead of leaving half-finished animations behind.
 */

const TICK_MS = 50;

interface Step {
  id: string;
  title: string;
  body: string;
  /**
   * The small print under the body. This is where the step says what it actually does rather than
   * what it looks like it does, so it lives in the rail — the stage beside it is aria-hidden.
   */
  note: string;
  /** Caption on the mock window's title bar. */
  chrome: string;
  durationMs: number;
}

const STEPS: Step[] = [
  {
    id: 'start',
    title: 'Start the meeting',
    body:
      'Paste the Zoom, Google Meet or Teams link and a silent bot joins and records for you. '
      + 'Sitting around a table instead? Hit record on your phone. Nothing to install for anyone else.',
    note: 'Meeting bots are on every plan; in-room recording comes with Team.',
    chrome: 'Syncmemos — New meeting',
    durationMs: 7000,
  },
  {
    id: 'talk',
    title: 'Let everyone say hello',
    body:
      'Add who is in the room, then go round the table — "Hi, I\'m John." Syncmemos separates the '
      + 'voices and puts your names to them, so the transcript reads as a conversation instead of a '
      + 'wall of text. Then just have your meeting.',
    note:
      'Names are matched to voices in the order people first speak — which is why the round of '
      + 'introductions goes first.',
    chrome: 'Syncmemos — Recording',
    durationMs: 9500,
  },
  {
    id: 'memo',
    title: 'The memo writes itself',
    body:
      'Nothing to press when you hang up. The summary is generated automatically: what you missed, '
      + 'what was decided, and who owns what. Send the link or print it to PDF.',
    note: 'Share links and PDF export are included on every plan.',
    chrome: 'Syncmemos — Q3 Product Strategy Sync',
    durationMs: 9500,
  },
];

/** How far `progress` has travelled through the window [from, to], clamped to 0…1. */
function windowProgress(progress: number, from: number, to: number): number {
  if (progress <= from) return 0;
  if (progress >= to) return 1;
  return (progress - from) / (to - from);
}

/** Fade-and-rise for one revealed element, driven by its own window of the step's progress. */
function reveal(progress: number, from: number, to: number): CSSProperties {
  const p = windowProgress(progress, from, to);
  return { opacity: p, transform: `translateY(${(1 - p) * 10}px)` };
}

function clock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** The server cannot know the preference; assume motion is fine and let the client correct it. */
const getReducedMotionOnServer = () => false;

/**
 * Drives the step index and its 0…1 progress.
 *
 * Starts at the finished frame (`progress` 1) so the server-rendered markup and a visitor who
 * never gets JS both see a complete stage rather than an empty one; the first scroll into view
 * rewinds to the start and plays. Autoplay is suspended while the section is off-screen, while a
 * mouse is resting on it, and entirely when the visitor asks for reduced motion.
 */
function useStepPlayer(restartSignal: number) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(1);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionOnServer,
  );

  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;

    // Scoped to the observer rather than kept in a ref: the first scroll into view rewinds to
    // step one, while a later re-entry resumes wherever the visitor left off.
    let hasPlayed = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && !hasPlayed) {
          hasPlayed = true;
          setStep(0);
          setProgress(0);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const playing = inView && !hovered && !reducedMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + TICK_MS / STEPS[step].durationMs;
        if (next < 1) return next;
        setStep((i) => (i + 1) % STEPS.length);
        return 0;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, step]);

  const goTo = useCallback(
    (index: number) => {
      setStep(index);
      // With motion suppressed nothing would ever advance the frame, so land on the finished one.
      setProgress(reducedMotion ? 1 : 0);
    },
    [reducedMotion],
  );

  // The hero's button asks for a replay from the top, whether or not the section has run before.
  // Adjusted during render rather than from an effect, so the rewind lands in the same commit as
  // the click instead of a frame later (https://react.dev/learn/you-might-not-need-an-effect).
  const [lastRestart, setLastRestart] = useState(restartSignal);
  if (lastRestart !== restartSignal) {
    setLastRestart(restartSignal);
    setStep(0);
    setProgress(0);
  }

  const pointerHandlers = useMemo(
    () => ({
      onPointerEnter: (event: ReactPointerEvent) => {
        if (event.pointerType === 'mouse') setHovered(true);
      },
      onPointerLeave: (event: ReactPointerEvent) => {
        if (event.pointerType === 'mouse') setHovered(false);
      },
    }),
    [],
  );

  return { sectionRef, step, progress, goTo, pointerHandlers };
}

/* -------------------------------------------------------------------------- */
/* Stages — decorative mock-ups of the real screens, hidden from assistive     */
/* tech because the rail beside them already carries the same information.     */
/* -------------------------------------------------------------------------- */

const MEETING_URL = 'https://us02web.zoom.us/j/84210093';

function StartStage({ progress }: { progress: number }) {
  const typedLength = Math.round(windowProgress(progress, 0.12, 0.55) * MEETING_URL.length);
  const typed = MEETING_URL.slice(0, typedLength);
  const consented = windowProgress(progress, 0.6, 0.68) > 0.5;
  const dispatched = progress >= 0.8;

  return (
    <div className="p-6 sm:p-8">
      <div style={reveal(progress, 0, 0.08)}>
        <div className="inline-flex gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1">
          <span className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
            Online
          </span>
          <span className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-500">
            In-room
          </span>
        </div>
      </div>

      <div className="mt-6" style={reveal(progress, 0.06, 0.14)}>
        <p className="text-xs font-semibold text-slate-700">Meeting URL</p>
        <div className="mt-2 flex min-h-[46px] items-center rounded-lg border border-slate-200 bg-white px-4 py-3">
          <span className="truncate font-mono text-[13px] text-slate-900">{typed}</span>
          {typedLength < MEETING_URL.length && (
            <span className="walkthrough-blink ml-0.5 inline-block h-4 w-[2px] shrink-0 bg-slate-900" />
          )}
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3" style={reveal(progress, 0.56, 0.64)}>
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-300 ${
            consented ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
          }`}
        >
          {consented && (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <p className="text-xs leading-relaxed text-slate-500">
          Everyone in this meeting has been told it is being recorded.
        </p>
      </div>

      <div className="mt-6 min-h-[46px]">
        {dispatched ? (
          <div
            className="walkthrough-stage-in inline-flex items-center gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3"
            style={reveal(progress, 0.8, 0.9)}
          >
            <span className="walkthrough-blink h-2 w-2 rounded-full bg-indigo-500" />
            <span className="text-sm font-semibold text-indigo-700">
              Bot is joining the call…
            </span>
          </div>
        ) : (
          <span
            className="inline-flex rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm"
            style={reveal(progress, 0.64, 0.72)}
          >
            Start meeting bot
          </span>
        )}
      </div>
    </div>
  );
}

const PARTICIPANTS = ['Sarah Jenkins', 'Marcus Lin', 'David Chen'];

const UTTERANCES = [
  { speaker: 'Sarah Jenkins', at: '00:04', text: "Hi everyone — I'm Sarah, I'll take us through the Q3 roadmap." },
  { speaker: 'Marcus Lin', at: '00:11', text: 'Marcus here, marketing side.' },
  { speaker: 'David Chen', at: '00:19', text: 'And David — engineering.' },
  { speaker: 'Sarah Jenkins', at: '00:31', text: "Great. Mobile architecture is lagging, so let's start there." },
];

function TalkStage({ progress }: { progress: number }) {
  const elapsed = Math.floor(windowProgress(progress, 0.02, 0.98) * 38);

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4" style={reveal(progress, 0, 0.06)}>
        <div className="flex items-center gap-2.5">
          <span className="walkthrough-blink h-2.5 w-2.5 rounded-full bg-rose-500" />
          <span className="font-mono text-sm font-semibold text-slate-900">{clock(elapsed)}</span>
        </div>
        <div className="flex h-6 items-center gap-[3px]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="walkthrough-wave-bar w-[3px] rounded-full bg-slate-300"
              style={{ height: '100%', animationDelay: `${i * 0.11}s` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PARTICIPANTS.map((name, i) => (
          <span
            key={name}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
            style={reveal(progress, 0.06 + i * 0.04, 0.13 + i * 0.04)}
          >
            {name}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        {UTTERANCES.map((line, i) => (
          <div key={i} style={reveal(progress, 0.24 + i * 0.15, 0.34 + i * 0.15)}>
            <div className="flex items-baseline gap-2.5">
              <span className="text-sm font-bold text-slate-900">{line.speaker}</span>
              <span className="font-mono text-[11px] text-slate-400">{line.at}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{line.text}</p>
          </div>
        ))}
      </div>

      <p
        className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500"
        style={reveal(progress, 0.88, 0.96)}
      >
        Matched in the order people first speak.
      </p>
    </div>
  );
}

const TAKEAWAYS = [
  'Q3 prioritises the new mobile app architecture over minor web enhancements.',
  'Marketing budget for the launch is approved at $150k.',
  'Engineering needs two more weeks for security audits before beta.',
];

const DECISIONS = [
  'Delay the beta launch to Nov 15th for security compliance.',
  'Move three backend developers to the mobile infrastructure team.',
];

function MemoStage({ progress }: { progress: number }) {
  const generating = progress < 0.18;

  if (generating) {
    return (
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="walkthrough-blink h-2 w-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">
            Meeting ended — writing the memo…
          </span>
        </div>
        <div className="mt-7 space-y-3">
          {[0.85, 0.65, 0.75, 0.45].map((width, i) => (
            <div
              key={i}
              className="h-3 rounded-full bg-slate-100"
              style={{ width: `${width * 100}%`, opacity: 0.4 + windowProgress(progress, 0, 0.18) * 0.6 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="walkthrough-stage-in p-6 sm:p-8">
      <div style={reveal(progress, 0.18, 0.26)}>
        <h3 className="text-lg font-extrabold tracking-tight text-slate-950">
          Q3 Product Strategy Sync
        </h3>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
          Summarised automatically · 45 min · 3 participants
        </p>
      </div>

      <div className="mt-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Key takeaways
        </p>
        <div className="mt-3 space-y-3">
          {TAKEAWAYS.map((item, i) => (
            <div
              key={i}
              className="flex gap-3"
              style={reveal(progress, 0.26 + i * 0.09, 0.34 + i * 0.09)}
            >
              <span className="font-mono text-xs font-bold text-indigo-600">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-sm leading-relaxed text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Decisions
        </p>
        <div className="mt-3 space-y-2.5">
          {DECISIONS.map((item, i) => (
            <div
              key={i}
              className="flex gap-3"
              style={reveal(progress, 0.56 + i * 0.07, 0.64 + i * 0.07)}
            >
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                fill="none"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm leading-relaxed text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5" style={reveal(progress, 0.7, 0.78)}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Action items
        </p>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-700">Draft the updated project timeline.</p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            Sarah
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" style={reveal(progress, 0.84, 0.94)}>
        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white">
          <span className="material-symbols-outlined text-[16px]">link</span>
          Copy share link
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-800">
          <span className="material-symbols-outlined text-[16px]">print</span>
          Print PDF
        </span>
      </div>
    </div>
  );
}

const STAGES = [StartStage, TalkStage, MemoStage];

/* -------------------------------------------------------------------------- */

interface HowItWorksProps {
  /** Bumped by the hero's "See how it works" button to replay from step one. */
  restartSignal?: number;
}

export function HowItWorks({ restartSignal = 0 }: HowItWorksProps) {
  const { sectionRef, step, progress, goTo, pointerHandlers } = useStepPlayer(restartSignal);
  const Stage = STAGES[step];

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="content-layer relative z-10 my-8 scroll-mt-28 rounded-3xl bg-white/80 px-margin-page py-section-gap backdrop-blur-sm"
      {...pointerHandlers}
    >
      <div className="mx-auto max-w-container-max">
        <div className="mb-stack-lg text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            How it works
          </p>
          <h2
            id="how-it-works-title"
            className="font-headline-lg mt-3 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl"
          >
            From &ldquo;hello&rdquo; to a shareable memo.
          </h2>
          <p className="font-body-lg mt-4 text-lg text-on-surface-variant">
            Three steps — and you spend the first two simply having your meeting.
          </p>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-14">
          {/* Step rail */}
          <ol className="space-y-2">
            {STEPS.map((item, i) => {
              const active = i === step;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={active ? 'step' : undefined}
                    className={`relative w-full rounded-2xl py-5 pl-6 pr-5 text-left transition-colors duration-300 ${
                      active ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Progress track — fills over the active step's duration. */}
                    <span className="absolute bottom-5 left-0 top-5 w-[3px] overflow-hidden rounded-full bg-slate-200">
                      <span
                        className="block w-full rounded-full bg-slate-900"
                        style={{
                          height: active ? `${Math.min(progress, 1) * 100}%` : '0%',
                          transition: 'height 50ms linear',
                        }}
                      />
                    </span>

                    <div className="flex items-start gap-4">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors duration-300 ${
                          active ? 'text-slate-950' : 'bg-slate-100 text-slate-400'
                        }`}
                        style={active ? { background: BRAND_HIGHLIGHT } : undefined}
                      >
                        {i + 1}
                      </span>
                      <div className={active ? '' : 'opacity-60'}>
                        <h3 className="font-headline-md text-lg font-bold tracking-tight text-slate-900">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                          {item.body}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.note}</p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Stage */}
          <div className="relative">
            {/* Soft brand glow behind the mock window. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-40 blur-3xl"
              style={{ background: BRAND_HIGHLIGHT }}
            />
            <div
              aria-hidden="true"
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.55)]"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                </span>
                <span className="truncate font-mono text-[11px] text-slate-400">
                  {STEPS[step].chrome}
                </span>
              </div>
              <div key={STEPS[step].id} className="walkthrough-stage-in min-h-[430px]">
                <Stage progress={progress} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-stack-lg flex justify-center">
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
          >
            See the memo it produces
            <span aria-hidden="true">&darr;</span>
          </a>
        </div>
      </div>
    </section>
  );
}
