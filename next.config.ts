import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
export default function config(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    ...(development
      ? {
          async rewrites() {
            return [
              {
                source: "/api/:path*",
                destination: "http://127.0.0.1:8788/api/:path*",
              },
            ];
          },
          async headers() {
            return [
              {
                source: "/:path*",
                headers: [
                  { key: "Cache-Control", value: "no-store" },
                  { key: "Referrer-Policy", value: "no-referrer" },
                  { key: "X-Content-Type-Options", value: "nosniff" },
                ],
              },
            ];
          },
        }
      : { output: "export" }),
    poweredByHeader: false,
    images: { unoptimized: true },
  };
}
