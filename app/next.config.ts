import type { NextConfig } from "next";

// TypeScript strict checking is enforced via GitHub Actions (.github/workflows/typecheck.yml)
// on every push, not during next build — Vercel's build runner OOMs at the tsc phase even
// with NODE_OPTIONS=--max-old-space-size=8192 because Next.js's TS worker subprocess does
// not inherit the flag. Keeping type safety enforced at CI time instead.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/settings/members",
        destination: "/dashboard/users",
        permanent: true,
      },
      {
        source: "/dashboard/ai/saved",
        destination: "/dashboard/ai/gpt",
        permanent: true,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
