import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { accountConfig } from "./lib/supabase/config";

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

// Fail production builds before public account values are inlined into browser and server bundles.
// Reuse the runtime validator so build and request-time checks enforce the same public configuration.
export default function configureNext(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) accountConfig();
  return nextConfig;
}
