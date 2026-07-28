"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Soft periwinkle → lavender → mauve highlight gradient.
const HIGHLIGHT =
    "linear-gradient(90deg, #a5b4fc 0%, #d8b4fe 55%, #eebef2 100%)";

const STATS = [
    { value: "90 sec", label: "To catch up" },
    { value: "0", label: "Notes to take" },
    { value: "1 link", label: "To share" },
];

export function BackgroundPaths() {
    return (
        <div
            className="relative w-full overflow-hidden bg-white pt-20 pb-20"
            style={{ fontFamily: "var(--font-geist-sans)" }}
        >
            <div className="relative z-10 container mx-auto px-4 md:px-6 flex flex-col items-center text-center">
                {/* Headline */}
                <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.95] text-neutral-950 mb-10">
                    Meetings,{" "}
                    <span
                        className="rounded-2xl px-4 py-0 text-neutral-950"
                        style={{
                            background: HIGHLIGHT,
                            WebkitBoxDecorationBreak: "clone",
                            boxDecorationBreak: "clone",
                        }}
                    >
                        memoed.
                    </span>
                </h1>

                {/* Subhead */}
                <p className="max-w-2xl mx-auto mb-10 text-base sm:text-lg leading-relaxed font-medium text-neutral-700">
                    Syncmemos turns every meeting into a clear, shareable document
                    with the summary, the decisions, and who owns what. Ready to send
                    the moment you hang up.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
                    <Link
                        href="/meetings"
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-lg font-semibold text-neutral-950 shadow-sm transition-opacity hover:opacity-90"
                        style={{ background: HIGHLIGHT }}
                    >
                        Get Started
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                        href="/s/demo"
                        className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-3 text-lg font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50"
                    >
                        See a sample
                    </Link>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 sm:gap-10">
                    {STATS.map((stat, i) => (
                        <Fragment key={stat.label}>
                            {i > 0 && <div className="h-10 w-px bg-neutral-200" />}
                            <div className="flex flex-col items-center">
                                <div className="text-2xl sm:text-3xl font-bold text-neutral-950">
                                    {stat.value}
                                </div>
                                <div className="text-sm text-neutral-500">
                                    {stat.label}
                                </div>
                            </div>
                        </Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
