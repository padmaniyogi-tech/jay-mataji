import type { NextConfig } from "next";

/**
 * The hosted sandbox preview embeds this app in an iframe served from the
 * preview host. Strict `frame-ancestors 'none'` / `X-Frame-Options: DENY`
 * silently turns that iframe into "refused to connect", so framing is allowed
 * only in development, or when ALLOW_EMBED=1 is set explicitly.
 * Production keeps the hardened defaults.
 */
const allowEmbed =
  ["1", "true", "yes", "on"].includes((process.env.ALLOW_EMBED ?? "").toLowerCase()) ||
  process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  ...(allowEmbed ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; dev uses eval for HMR.
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      process.env.NODE_ENV === "production"
        ? "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com"
        : "connect-src 'self' ws: wss: https://api.razorpay.com https://lumberjack.razorpay.com",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      allowEmbed
        ? "frame-ancestors 'self' https://*.e2b.app https://*.arena.ai http://localhost:* http://127.0.0.1:*"
        : "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow the hosted preview / tunnelled dev origins used by Arena and similar sandboxes.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "razorpay", "nodemailer", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
