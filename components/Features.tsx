"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

// Horizontal scroll feature showcase with CSS scroll-snap.
// Section header fades in with REVEAL_Y on scroll enter; cards scroll natively.
export function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const features = useMemo(
    () => [
      {
        label: "Accountability",
        title: "Verify Friends",
        description: "Make sure they also aren't being lazy.",
        image: "https://placehold.co/560x420/F0F0F0/666?text=Verify+Friends",
      },
      {
        label: "Reminders",
        title: "Set reminders",
        description: "So you don't forget you should be off your phone.",
        image: "https://placehold.co/560x420/F0F0F0/666?text=Reminders",
      },
      {
        label: "Stakes",
        title: "Set an Ante",
        description: "Pay for your laziness, literally.",
        image: "https://placehold.co/560x420/F0F0F0/666?text=Set+an+Ante",
      },
      {
        label: "Organisation",
        title: "Set lists",
        description: "Organise everything in one clean view.",
        image: "https://placehold.co/560x420/F0F0F0/666?text=Lists",
      },
      {
        label: "Personalisation",
        title: "Add custom emojis",
        description: "Make every task unique.",
        image: "https://placehold.co/560x420/F0F0F0/666?text=Custom+Emojis",
      },
    ],
    []
  );

  useLayoutEffect(() => {
    if (!sectionRef.current || !headerRef.current) return;

    ensureGsapEase();

    const context = gsap.context(() => {
      // Fade the section header in when it enters the viewport.
      gsap.from(headerRef.current, {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: NATURAL_EASE,
        scrollTrigger: {
          trigger: headerRef.current,
          start: "top 80%",
        },
      });
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      id="features"
      ref={sectionRef}
      data-cursor-color="#1a1a1a"
      className="relative py-16 md:py-24 bg-[#FAFBFC] text-[#1a1a1a]"
    >
      {/* Section header */}
      <div ref={headerRef} className="container mx-auto max-w-6xl px-6 text-center mb-12 md:mb-16">
        <h2 className="text-4xl md:text-6xl mb-4 font-serif-custom font-semibold">
          What else can Ante do?
        </h2>
        <p className="text-lg md:text-xl text-[#1a1a1a]/60">
          Everything you need to keep yourself (and your friends) honest.
        </p>
      </div>

      {/* Horizontal scroll container with CSS scroll-snap */}
      <div
        className="overflow-x-auto pb-8 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#00A4C6]/30 hover:scrollbar-thumb-[#00A4C6]/50"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="flex gap-6 md:gap-8 px-6 md:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="min-w-[280px] md:min-w-[420px] flex-shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              {/* Feature image */}
              <div className="rounded-xl bg-[#F0F0F0] aspect-[4/3] overflow-hidden mb-6">
                <Image
                  src={feature.image}
                  alt={feature.title}
                  width={560}
                  height={420}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Feature label */}
              <span className="text-sm uppercase tracking-[0.15em] text-[#00A4C6] font-medium">
                {feature.label}
              </span>

              {/* Feature title */}
              <h3 className="text-2xl font-serif-custom font-semibold text-[#1a1a1a] mt-2">
                {feature.title}
              </h3>

              {/* Feature description */}
              <p className="text-base text-[#1a1a1a]/60 mt-2">
                {feature.description}
              </p>
            </article>
          ))}

          {/* Spacer to prevent last card from edge-clipping */}
          <div className="min-w-[1px] flex-shrink-0" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
