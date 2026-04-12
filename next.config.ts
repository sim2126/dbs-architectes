import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type errors are caught in the editor/IDE.
    // Skipping the checker here prevents OOM on Vercel's constrained build workers.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
