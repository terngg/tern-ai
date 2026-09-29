import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@tern-ai/core"],
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  experimental: { useTypeScriptCli: false },
  outputFileTracingIncludes: {
    "/api/gtps": ["../../docs/gtps-lua-api.md"],
    "/api/ai/generate": ["../../docs/gtps-lua-api.md"],
  },
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com https://openrouter.ai; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
