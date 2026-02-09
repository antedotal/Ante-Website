"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowRightIcon } from "./ui/icons";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import { ShimmerButton } from "./ui/shimmer-button";
import Beams from "./ui/Beams";

// Hero section with GSAP entrance animation and typewriter headline.
export function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const phrases = [
    "Always Procrastinating?",
    "Been putting off something important?",
    "Stuck scrolling reels?",
  ];

  useLayoutEffect(() => {
    ensureGsapEase();
    const context = gsap.context(() => {
      // Sequential hero reveal for a smooth, guided entrance.
      gsap.from([headingRef.current, subtitleRef.current, actionRef.current], {
        opacity: 0,
        y: 24,
        duration: 1,
        ease: NATURAL_EASE,
        stagger: 0.18,
      });

      // Loop through hero phrases with a blur/scale effect.
      const phraseEls = gsap.utils.toArray<HTMLElement>("[data-hero-phrase]");
      
      // Initialize state: hidden, blurred, slightly scaled down
      gsap.set(phraseEls, { opacity: 0, scale: 0.95, filter: "blur(8px)" });

      const phraseTimeline = gsap.timeline({ repeat: -1 });

      phraseEls.forEach((element) => {
        // Entrance: Fade in, focus, scale to normal
        phraseTimeline.to(element, {
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.8,
          ease: "power3.out",
        });

        // Exit: Fade out, blur, scale up slightly
        phraseTimeline.to(
          element,
          {
            opacity: 0,
            scale: 1.05,
            filter: "blur(8px)",
            duration: 0.6,
            ease: "power3.in",
          },
          "+=2"
        );
        
        // Reset for next loop
        phraseTimeline.set(element, { opacity: 0, scale: 0.95, filter: "blur(8px)" });
      });
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-cursor-color="#ffffff"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6 pt-16 sm:pt-20 md:pt-24 pb-12 sm:pb-16 md:pb-20"
    >
      <Beams
        className="absolute inset-0 -z-10 h-full w-full bg-[#003949]"
        colors={["#006480", "#008EB0", "#00A4C6", "#D4F1F9"]}
        beamWidth={8}
        beamHeight={20}
        beamNumber={12}
        speed={0.8}
      />
      <div className="container mx-auto max-w-5xl relative z-10 text-center">
        <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-[32px] sm:rounded-[40px] md:rounded-[48px] p-5 sm:p-8 md:p-12 lg:p-20 overflow-hidden shadow-2xl ring-1 ring-white/10">
          <h1
            ref={headingRef}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl xl:text-8xl tracking-tight mb-6 sm:mb-8 leading-tight text-white font-serif-custom font-semibold"
          >
            <span className="relative inline-block w-full max-w-[22ch] min-h-[2.6em] sm:min-h-[3em] md:min-h-[3.2em] leading-[1.2] py-[0.3em] overflow-visible break-words">
              {phrases.map((phrase) => (
                <span
                  key={phrase}
                  data-hero-phrase
                  className="absolute inset-0 flex items-center justify-center text-center opacity-0 blur-lg scale-95"
                >
                  {phrase}
                </span>
              ))}
            </span>
          </h1>

          <p
            ref={subtitleRef}
            className="text-base sm:text-xl md:text-2xl text-white/80 mb-8 sm:mb-10 md:mb-12 max-w-3xl mx-auto"
          >
            Use social pressure and the fear of going broke to get off your a**.
          </p>

          <div ref={actionRef} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ShimmerButton
              shimmerColor="#ffffff"
              shimmerSize="0.08em"
              shimmerDuration="2.5s"
              background="linear-gradient(135deg, #00A4C6 0%, #007893 100%)"
              borderRadius="9999px"
              className="w-full sm:w-auto px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 text-base sm:text-lg font-semibold"
              href="/signup"
              data-cursor-hover="true"
            >
              Join the waitlist
              <span className="ml-2 inline-flex items-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1">
                <ArrowRightIcon className="w-4 h-4" />
              </span>
            </ShimmerButton>
          </div>
        </div>
      </div>
    </section>
  );
}
