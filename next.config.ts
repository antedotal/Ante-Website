import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit remote placeholder images used in the marketing sections.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;
