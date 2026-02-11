"use client";

import { useLayoutEffect, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "./ui/icons";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import Beams from "./ui/Beams";

// Words that cycle in the "Stop ___." headline.
const ROTATING_WORDS = ["procrastinating", "scrolling", "avoiding"];
const WORD_HOLD_DURATION = 2500; // ms each word stays visible

// Hero section with staggered y-translate entrance and rotating single word.
export function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const wordContainerRef = useRef<HTMLSpanElement>(null);

  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // GSAP entrance: staggered y + opacity (eyebrow → heading → subtitle → button).
  useLayoutEffect(() => {
    ensureGsapEase();
    const context = gsap.context(() => {
      gsap.from(
        [eyebrowRef.current, headingRef.current, subtitleRef.current, actionRef.current],
        {
          opacity: 0,
          y: 40,
          duration: 0.9,
          ease: NATURAL_EASE,
          stagger: 0.15,
        }
      );
    }, sectionRef);

    return () => context.revert();
  }, []);

  // Rotating word animation: slide up/out → slide in from below.
  const animateWord = useCallback(() => {
    if (!wordContainerRef.current || isAnimating) return;

    setIsAnimating(true);
    const container = wordContainerRef.current;

    // Slide current word up and fade out
    gsap.to(container, {
      y: -30,
      opacity: 0,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        setCurrentWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        // Position new word below, then animate in
        gsap.set(container, { y: 30, opacity: 0 });
        gsap.to(container, {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
          onComplete: () => setIsAnimating(false),
        });
      },
    });
  }, [isAnimating]);

  // Timer loop to cycle words every WORD_HOLD_DURATION.
  useEffect(() => {
    const interval = setInterval(animateWord, WORD_HOLD_DURATION);
    return () => clearInterval(interval);
  }, [animateWord]);

  return (
    <section
      ref={sectionRef}
      data-cursor-color="#ffffff"
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 sm:px-6"
    >
      {/* Reduced beams: 6 beams, speed 0.4, muted colors */}
      <Beams
        className="absolute inset-0 -z-10 h-full w-full bg-[#003949]"
        colors={["#004d5e", "#006880", "#007d99", "#D4F1F9"]}
        beamWidth={8}
        beamHeight={20}
        beamNumber={6}
        speed={0.4}
      />

      {/* Content directly on teal background — no glass panel */}
      <div className="container mx-auto max-w-4xl relative z-10 text-center">
        {/* Eyebrow */}
        <p
          ref={eyebrowRef}
          className="uppercase tracking-[0.2em] text-white/50 text-xs sm:text-sm mb-6"
        >
          The Social Task Manager
        </p>

        {/* Heading with rotating word — single line, no wrap */}
        <h1
          ref={headingRef}
          className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl tracking-tight mb-6 sm:mb-8 leading-[1.1] text-white font-serif-custom font-semibold whitespace-nowrap"
        >
          Stop{" "}
          <span
            className="inline-block align-bottom relative"
            style={{ clipPath: "inset(0 -200% 0 -200%)" }}
          >
            <span
              ref={wordContainerRef}
              className="inline-block text-[#7DD4E8] whitespace-nowrap"
            >
              {ROTATING_WORDS[currentWordIndex]}
            </span>
          </span>
        </h1>

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-lg md:text-xl text-white/60 mb-10 md:mb-12 max-w-2xl mx-auto"
        >
          Use social pressure and the fear of going broke to get off your a**.
        </p>

        {/* Plain solid CTA button — no shimmer */}
        <div ref={actionRef} className="flex justify-center">
          <Link
            href="/signup"
            data-cursor-hover="true"
            className="inline-flex items-center gap-2 px-8 py-4 md:px-10 md:py-5 rounded-full bg-[#00A4C6] hover:bg-[#008da8] text-white text-base sm:text-lg font-semibold transition-colors duration-200"
          >
            Join the waitlist
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
