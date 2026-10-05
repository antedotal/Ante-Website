"use client";

/**
 * Not Found Page — app/not-found.tsx
 *
 * Minimalist, high-impact 404 error page matching the design system of Ante:
 * - Full-screen Jomo-style inset card with rounded corners and white outer framing
 * - Animated WebGL Grainient gradient background (#236597, #4A8B9F, #00b0df)
 * - Prominent "404" watermark layer in the background
 * - Bold, on-brand headline in font-serif-custom (wdth 125, ROND 50)
 * - High-contrast action pill buttons: "Back to Home" (primary) and "Join Waitlist" (secondary)
 * - Distraction-free: navbar, footer, and subtitle removed as requested
 */

import Link from "next/link";
import Grainient from "@/components/ui/Grainient";
import { ArrowRightIcon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <main className="min-h-screen p-2 sm:p-3 md:p-6 flex flex-col justify-center bg-white text-[#1a1a1a]">
      {/* Inset hero-style card filling the full viewport with rounded borders and shadow */}
      <div className="rounded-2xl md:rounded-3xl overflow-hidden relative flex-1 min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-1.5rem)] md:min-h-[calc(100vh-3rem)] flex items-center justify-center p-6 sm:p-12 text-center text-white shadow-2xl">
        {/* Animated WebGL gradient background — brand color palette */}
        <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}>
          <Grainient
            color1="#236597"
            color2="#4A8B9F"
            color3="#00b0df"
            timeSpeed={0.25}
            colorBalance={0}
            warpStrength={1}
            warpFrequency={5}
            warpSpeed={2}
            warpAmplitude={50}
            blendAngle={0}
            blendSoftness={0.05}
            rotationAmount={500}
            noiseScale={2}
            grainAmount={0.1}
            grainScale={2}
            grainAnimated={false}
            contrast={1.5}
            gamma={1}
            saturation={1}
            centerX={0}
            centerY={0}
            zoom={0.9}
          />
        </div>

        {/* High-visibility background watermark for 404 */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-1 overflow-hidden"
          aria-hidden="true"
        >
          <span className="text-[40vw] sm:text-[32vw] md:text-[26vw] font-serif-custom font-bold text-white/[0.14] leading-none tracking-tighter drop-shadow-sm">
            404
          </span>
        </div>

        {/* Centered foreground content */}
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
          {/* Main punchy headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-serif-custom font-semibold tracking-tight text-white mb-8 sm:mb-10 leading-[1.1]">
            Stop looking for what isn&apos;t here.
          </h1>

          {/* Call to action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white hover:bg-white/90 text-[#4A8B9F] text-base sm:text-lg font-semibold transition-colors duration-200 shadow-xl"
            >
              Back to Home
              <ArrowRightIcon className="w-5 h-5" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-base sm:text-lg font-semibold transition-colors duration-200 backdrop-blur-md border border-white/20"
            >
              Join Waitlist
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
