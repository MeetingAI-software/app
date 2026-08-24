import type { NextConfig } from "next";

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
})();

const scriptSrc = ["'self'", "'unsafe-inline'", "https://cdn.paddle.com", "https://*.paddle.com"];
if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${apiOrigin} https://*.paddle.com https://*.sentry.io`,
  "frame-src https://*.paddle.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paddle.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Day 6 §1: security headers on the one public HTML surface (the share page + the app shell).
// The API gets its headers from helmet; Next serves the browser-facing HTML, so it sets these.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(self), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// No /api/* rewrite: every API call goes straight to NEXT_PUBLIC_API_URL from the browser, so the
// session cookie is set on the API host it belongs to. Proxying through here would also have
// shadowed the whole /api namespace on the web origin.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/s/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
    ];
  },
};

export default nextConfig;
