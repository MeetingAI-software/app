import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The browser talks to the API host directly (see the rewrite note below), so it has to be named
// in connect-src or every fetch and the live-transcript SSE stream is blocked. Read at build time,
// which is when Vercel's env is available to this file.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "https://api.syncmemos.com";

/**
 * Content-Security-Policy.
 *
 * Shipped Report-Only first: flip CSP_REPORT_ONLY to false once a full pass through the app
 * (including the Paddle checkout overlay and an in-room recording played back) reports no
 * violations in the console. Report-Only cannot break anything, an enforcing typo can.
 *
 * Nothing here is decorative — every relaxation below is load-bearing for a specific feature, so
 * check the comment before trimming one.
 */
const CSP_REPORT_ONLY = true;

const csp = [
  "default-src 'self'",

  // 'unsafe-inline': the App Router inlines its RSC payload as <script>self.__next_f.push(…)</script>.
  // Dropping it needs a per-request nonce from middleware, which would force the landing, pricing
  // and legal pages out of static rendering. cdn.paddle.com: Paddle.js injects its own script tag.
  `script-src 'self' 'unsafe-inline' https://cdn.paddle.com${isDev ? " 'unsafe-eval'" : ""}`,

  // 'unsafe-inline': React renders style={{…}} props as style="…" attributes in the SSR HTML.
  // fonts.googleapis.com: the Material Symbols stylesheet in app/layout.tsx.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

  // next/font self-hosts the five text faces ('self'); gstatic serves the Material Symbols files.
  "font-src 'self' https://fonts.gstatic.com data:",

  "img-src 'self' data: blob: https://*.paddle.com",

  // blob: — InRoomRecorder plays the finished recording back from a createObjectURL blob.
  "media-src 'self' blob:",

  // Deduped: in dev NEXT_PUBLIC_API_URL is usually the localhost origin already.
  `connect-src ${[
    ...new Set([
      "'self'",
      apiOrigin,
      "https://*.paddle.com",
      ...(isDev ? ["http://localhost:3000", "ws://localhost:3001"] : []),
    ]),
  ].join(" ")}`,

  // The Paddle checkout overlay is an iframe.
  "frame-src https://*.paddle.com",

  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",

  // Enforcement-only; browsers log that they ignore it while the policy is Report-Only.
  // Omitted in dev so it cannot interfere with the http://localhost API origin.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Day 6 §1: security headers on the one public HTML surface (the share page + the app shell).
// The API gets its headers from helmet; Next serves the browser-facing HTML, so it sets these.
const securityHeaders = [
  // Kept alongside frame-ancestors, which browsers predating CSP Level 2 ignore.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    value: csp,
  },
];

// No /api/* rewrite: every API call goes straight to NEXT_PUBLIC_API_URL from the browser, so the
// session cookie is set on the API host it belongs to. Proxying through here would also have
// shadowed the whole /api namespace on the web origin.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
