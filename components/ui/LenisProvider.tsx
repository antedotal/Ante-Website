"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * LenisProvider: Initializes Lenis smooth scrolling for the entire site and
 * synchronizes it with GSAP ScrollTrigger.
 *
 * Purpose & Functionality:
 * 1. Synchronizes Lenis scroll events with GSAP ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`),
 *    ensuring all pinned containers and scroll-driven triggers stay perfectly locked with the viewport.
 * 2. Drives Lenis updates via GSAP's central ticker instead of a standalone requestAnimationFrame loop.
 *    This eliminates duplicate animation frames across the application and prevents frame conflicts.
 * 3. Disables GSAP ticker lag smoothing (`lagSmoothing(0)`) so smooth scroll deltas are applied
 *    monotonically without abrupt catch-up skips or rubber-banding.
 */
export function LenisProvider() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
    });

    // Keep GSAP ScrollTrigger in sync with Lenis on every scroll step
    lenis.on("scroll", ScrollTrigger.update);

    // Drive Lenis directly via GSAP ticker to eliminate duplicate RAF loops
    const updateTicker = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    // Expose Lenis globally for anchor scrolling coordination across components
    if (typeof window !== "undefined") {
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    }

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __lenis?: Lenis }).__lenis;
      }
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
    };
  }, []);

  return null;
}
