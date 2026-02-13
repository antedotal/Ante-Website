"use client";

import { useLayoutEffect, useRef, useState, useEffect, useCallback } from "react";
import { AppleIcon } from "./ui/icons";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import { useDeviceType } from "@/lib/useDeviceType";
import Grainient from "./ui/Grainient";

// Words that cycle in the "Stop ___." headline.
const ROTATING_WORDS = ["procrastinating", "scrolling", "avoiding", "being lazy", "wasting time", "idling", "wasting your future", "putting it off"];
const WORD_HOLD_DURATION = 2500; // ms each word stays visible

// Hero section — Jomo-style split layout: text left, app mockup right.
export function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const wordContainerRef = useRef<HTMLSpanElement>(null);

  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const isAnimatingRef = useRef(false);

  // Detect client platform for conditional download button rendering.
  const { isAndroid, isIOS, isMobile } = useDeviceType();

  // GSAP entrance: staggered y + opacity for text, separate entrance for mockup.
  useLayoutEffect(() => {
    ensureGsapEase();
    const context = gsap.context(() => {
      // Text elements stagger in from left
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
      // App mockup fades and slides in from the right
      if (mockupRef.current) {
        gsap.from(mockupRef.current, {
          opacity: 0,
          x: 60,
          duration: 1.1,
          ease: NATURAL_EASE,
          delay: 0.3,
        });
      }
    }, sectionRef);

    return () => context.revert();
  }, []);

  // Rotating word animation: slide up/out → slide in from below.
  // Uses a ref for the animating flag so the callback identity stays stable,
  // preventing the setInterval from being torn down and recreated each cycle.
  const animateWord = useCallback(() => {
    if (!wordContainerRef.current || isAnimatingRef.current) return;

    isAnimatingRef.current = true;
    const container = wordContainerRef.current;

    // Slide current word up and fade out
    gsap.to(container, {
      y: -30,
      opacity: 0,
      duration: 0.4,
      ease: NATURAL_EASE,
      onComplete: () => {
        setCurrentWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        // Position new word below, then animate in
        gsap.set(container, { y: 30, opacity: 0 });
        gsap.to(container, {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: NATURAL_EASE,
          onComplete: () => { isAnimatingRef.current = false; },
        });
      },
    });
  }, []);

  // Timer loop to cycle words every WORD_HOLD_DURATION.
  useEffect(() => {
    const interval = setInterval(animateWord, WORD_HOLD_DURATION);
    return () => clearInterval(interval);
  }, [animateWord]);

  return (
    <section
      ref={sectionRef}
      id="download"
      data-cursor-color="#ffffff"
      className="relative min-h-screen flex items-center overflow-hidden px-4 sm:px-6"
    >
      {/* Animated WebGL gradient background — fills the entire hero via absolute wrapper */}
      <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <Grainient
          color1="#236597"
          color2="#003949"
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

      {/* Split layout: text left, mockup right */}
      <div className="container mx-auto max-w-6xl relative z-10 grid grid-cols-1 lg:grid-cols-2 items-center gap-8 lg:gap-10 py-24 md:py-0">
        {/* Left column — text content, left-aligned */}
        <div className="text-left">
          {/* Eyebrow */}
          <p
            ref={eyebrowRef}
            className="uppercase tracking-[0.2em] text-white/50 text-xs sm:text-sm mb-6"
          >
            The Punishing Social Task Manager
          </p>

          {/* Heading with rotating word — "Stop" on line 1, rotating word on line 2 */}
          <h1
            ref={headingRef}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight mb-6 sm:mb-8 leading-[1.1] text-white font-serif-custom font-semibold"
          >
            Stop
            <br />
            <span
              className="inline-block relative"
              style={{ clipPath: "inset(0 -200% 0 -200%)" }}
            >
              <span
                ref={wordContainerRef}
                className="inline-block text-[#A8E8F8] whitespace-nowrap"
              >
                {ROTATING_WORDS[currentWordIndex]}
              </span>
            </span>
          </h1>

          {/* Subtitle */}
          <p
            ref={subtitleRef}
            className="text-lg md:text-xl text-white/60 mb-10 md:mb-12 max-w-lg"
          >
            Use social pressure and monetary deterrence to get off your a**.
          </p>

          {/* Download buttons — disabled "Coming Soon" state until app is published */}
          <div ref={actionRef} className="flex flex-wrap justify-start gap-3">
            {/* iOS button — shown on iOS mobile or on desktop */}
            {(!isMobile || isIOS) && (
              <button
                disabled
                className="inline-flex items-center gap-2 px-6 py-3.5 md:px-8 md:py-4 rounded-full bg-white/80 text-[#003949]/70 text-sm sm:text-base font-semibold cursor-default"
              >
                <AppleIcon className="w-5 h-5" />
                iOS — Coming Soon
              </button>
            )}
            {/* Android button — shown on Android mobile or on desktop */}
            {(!isMobile || isAndroid) && (
              <button
                disabled
                className="inline-flex items-center gap-2 px-6 py-3.5 md:px-8 md:py-4 rounded-full bg-white/80 text-[#003949]/70 text-sm sm:text-base font-semibold cursor-default"
              >
                <span className="material-symbols-rounded text-[20px] leading-none">android</span>
                Android — Coming Soon
              </button>
            )}
          </div>
        </div>

        {/* Right column — app mockup placeholder */}
        <div ref={mockupRef} className="hidden lg:flex items-center justify-center">
          <div className="relative w-70 h-140 rounded-[3rem] border-[6px] border-white/15 bg-[#001A20] shadow-2xl shadow-black/30 overflow-hidden">
            {/* Phone notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#001A20] rounded-b-2xl z-20" />
            {/* Mock app screen content */}
            <div className="absolute inset-0 flex flex-col p-5 pt-10">
              {/* Status bar */}
              <div className="flex justify-between items-center text-[10px] text-white/40 mb-6">
                <span>9:41</span>
                <div className="flex gap-1">
                  <div className="w-3.5 h-2 rounded-sm bg-white/30" />
                  <div className="w-1 h-2 rounded-sm bg-white/20" />
                </div>
              </div>
              {/* App header */}
              <p className="text-white/90 text-sm font-semibold font-serif-custom mb-1">My Tasks</p>
              <p className="text-white/40 text-[10px] mb-5">3 tasks due today</p>
              {/* Mock task cards */}
              {[
                { title: "Finish assignment", ante: "$20", color: "#006F87", progress: 0.7 },
                { title: "Hit the gym", ante: "$15", color: "#A8E8F8", progress: 0.3 },
                { title: "Read 30 pages", ante: "$10", color: "#006F87", progress: 0 },
              ].map((task, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white/6 border border-white/8 p-3.5 mb-3 backdrop-blur-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-white/90 text-xs font-medium">{task.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: task.color + "25", color: task.color }}>
                      {task.ante}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${task.progress * 100}%`, background: task.color }}
                    />
                  </div>
                </div>
              ))}
              {/* Footer hint */}
              <div className="mt-auto flex justify-center">
                <div className="w-8 h-8 rounded-full bg-[#006F87]/20 flex items-center justify-center">
                  <span className="text-[#006F87] text-lg leading-none">+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
