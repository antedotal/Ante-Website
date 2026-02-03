"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowRightIcon } from "./ui/icons";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import { ShimmerButton } from "./ui/shimmer-button";
import ColorBendBackground from "./ColorBendBackground";

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

      // Loop through hero phrases with a fade-up effect.
      const phraseEls = gsap.utils.toArray<HTMLElement>("[data-hero-phrase]");
      gsap.set(phraseEls, { opacity: 0, y: 24 });
      if (phraseEls[0]) {
        gsap.set(phraseEls[0], { opacity: 1, y: 0 });
      }

      const phraseTimeline = gsap.timeline({ repeat: -1 });
      phraseEls.forEach((element) => {
        phraseTimeline.to(element, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: NATURAL_EASE,
        });
        phraseTimeline.to(
          element,
          {
            opacity: 0,
            y: -24,
            duration: 0.6,
            ease: NATURAL_EASE,
          },
          "+=1.4"
        );
        phraseTimeline.set(element, { opacity: 0, y: 24 });
      });
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-cursor-color="#ffffff"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-20"
    >
      <ColorBendBackground
        className="absolute inset-0 -z-10 h-full w-full"
        colors={["#003949", "#006480", "#008EB0"]}
      />
      <div className="container mx-auto max-w-5xl relative z-10 text-center">
        <h1
          ref={headingRef}
          className="text-5xl md:text-7xl lg:text-8xl tracking-tight mb-8 leading-tight text-white font-serif-custom font-semibold"
        >
          <span className="relative inline-block w-full max-w-[22ch] min-h-[3.2em] leading-[1.2] py-[0.3em] overflow-visible break-words">
            {phrases.map((phrase, index) => (
              <span
                key={phrase}
                data-hero-phrase
                className={`absolute inset-0 flex items-center justify-center text-center ${index === 0 ? "opacity-100" : "opacity-0"}`}
              >
                {phrase}
              </span>
            ))}
          </span>
        </h1>

        <p
          ref={subtitleRef}
          className="text-xl md:text-2xl text-white/80 mb-12 max-w-3xl mx-auto"
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
            className="w-full sm:w-auto px-10 py-5 text-lg font-semibold"
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
    </section>
  );
}
