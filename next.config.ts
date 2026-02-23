import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit remote placeholder images used in the marketing sections.
  images: {
    qualities: [75, 90, 95, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;
