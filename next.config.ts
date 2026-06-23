import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy. Set here (not in a proxy) because per-request proxy
// header injection misbehaves in this Next/Turbopack build — it dropped the
// Cookie header downstream, breaking auth. A static policy can't carry a nonce,
// so script-src uses 'unsafe-inline'; the app loads no third-party scripts, so
// this still blocks attacker-hosted JS from other origins. Allowances:
//  - style-src 'unsafe-inline': pervasive inline style={{}} + Tailwind v4.
//  - 'wasm-unsafe-eval' + worker/blob: the html5-qrcode door scanner.
//  - img/media blob: + data: for camera frames and object-URL previews.
//  - dev adds 'unsafe-eval' (React refresh) and ws: (HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Security headers applied to every response.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.0.104"],
  devIndicators: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};


export default nextConfig;
