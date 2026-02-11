"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { ArrowRightIcon } from "@/components/ui/icons";

gsap.registerPlugin(ScrollTrigger);

// CTA heading text — "better person?" kept together to prevent orphan line break.
const CTA_WORDS = ["Ready", "to", "be", "a", "better\u00A0person?"];

// Final CTA section with character-split GSAP entrance and radial glow.
export function CallToAction() {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!sectionRef.current) return;

    ensureGsapEase();

    const context = gsap.context(() => {
      // Character-split staggered entrance for the heading.
      const chars = gsap.utils.toArray<HTMLSpanElement>("[data-cta-char]");
      gsap.from(chars, {
        y: 60,
        opacity: 0,
        duration: 0.7,
        ease: NATURAL_EASE,
        stagger: 0.02,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
        },
      });

      // Subtitle fades in after heading.
      gsap.from(copyRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: NATURAL_EASE,
        delay: 0.4,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
        },
      });

      // Button fades in after subtitle.
      gsap.from(buttonRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: NATURAL_EASE,
        delay: 0.55,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
        },
      });
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-cursor-color="#ffffff"
      className="py-24 sm:py-32 md:py-40 px-4 sm:px-6 text-center relative overflow-hidden bg-[#003949]"
    >
      {/* Subtle radial glow on matching background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0,164,198,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="container mx-auto max-w-3xl relative z-10">
        {/* Word-split heading — "better person?" treated as one unit to prevent orphan break */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl mb-6 sm:mb-8 tracking-tight text-white font-serif-custom font-semibold leading-tight">
          {CTA_WORDS.map((word, wi) => (
            <span key={wi} className="inline-block mr-[0.3em] last:mr-0">
              {word.split("").map((char, ci) => (
                <span key={`${wi}-${ci}`} data-cta-char className="inline-block">
                  {char === "\u00A0" ? "\u00A0" : char}
                </span>
              ))}
            </span>
          ))}
        </h2>

        <p ref={copyRef} className="text-base sm:text-xl md:text-2xl text-white/80 mb-8 sm:mb-10 md:mb-12">
          Join the people who actually get things done.
        </p>

        <div ref={buttonRef} className="flex justify-center">
          <MagneticButton>
            <ShimmerButton
              shimmerColor="#ffffff"
              shimmerSize="0.08em"
              shimmerDuration="2.5s"
              background="linear-gradient(135deg, #00A4C6 0%, #007893 100%)"
              borderRadius="9999px"
              className="px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 text-base sm:text-lg font-bold"
              href="/signup"
            >
              Join the waitlist
              <span className="ml-2 inline-flex items-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1">
                <ArrowRightIcon className="w-5 h-5" />
              </span>
            </ShimmerButton>
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
