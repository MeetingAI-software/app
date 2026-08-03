import type { NextConfig } from "next";

// Day 6 §1: security headers on the one public HTML surface (the share page + the app shell).
// The API gets its headers from helmet; Next serves the browser-facing HTML, so it sets these.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
