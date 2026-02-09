"use client";

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

// Scroll-pinned How It Works section with synced cards and media.
// On mobile (<lg), disables pin/scrub and uses simple fade-in with inline images.
export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const cardsTrackRef = useRef<HTMLDivElement>(null);
  const mediaTrackRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  const steps = useMemo(
    () => [
      {
        title: "Add your friends as verifiers",
        description: "Invite your friends to keep you honest and call out the excuses.",
        image: "https://placehold.co/520x640/png?text=Verifiers",
      },
      {
        title: "Set the Ante",
        description: "Put real money on the line so your goals feel urgent.",
        image: "https://placehold.co/520x640/png?text=Set+the+Ante",
      },
      {
        title: "Do the damn task",
        description: "Follow through. Knock it out. No loopholes.",
        image: "https://placehold.co/520x640/png?text=Do+the+Task",
      },
      {
        title: "Submit proof",
        description: "Upload a photo or receipt so your verifier can check it.",
        image: "https://placehold.co/520x640/png?text=Submit+Proof",
      },
      {
        title: "Get verified (or pay)",
        description: "If they approve, you keep your cash. If not, you pay up.",
        image: "https://placehold.co/520x640/png?text=Verified+or+Pay",
      },
    ],
    []
  );

  // Detect mobile breakpoint for conditional GSAP behavior.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useLayoutEffect(() => {
    ensureGsapEase();
    const cardsTrack = cardsTrackRef.current;
    const mediaTrack = mediaTrackRef.current;
    const pinSection = pinRef.current;

    if (!sectionRef.current || !cardsTrack || !pinSection) {
      return;
    }

    const context = gsap.context(() => {
      if (isMobile) {
        // Mobile: simple fade-in per card, no pin/scrub.
        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        cards.forEach((card) => {
          gsap.from(card, {
            opacity: 0,
            y: 24,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
            },
          });
        });
      } else {
        // Desktop: pinned scroll with synced cards and media.
        if (!mediaTrack) return;

        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        const media = gsap.utils.toArray<HTMLDivElement>("[data-how-media]");
        const cardHeight = cards[0]?.offsetHeight || 0;
        const cardGap = 24;
        let activeIndex = -1;

        // Initialize cards and media visibility for a clean scroll reveal.
        gsap.set(cards, { opacity: 0.35, y: 24 });
        gsap.set(media, { autoAlpha: 0, scale: 0.98 });

        const scrollDistance = (cardHeight + cardGap) * (cards.length - 1);

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: pinSection,
            start: "top-=100 top",
            end: `+=${scrollDistance}`,
            scrub: true,
            pin: pinSection,
            anticipatePin: 1,
            onUpdate: (self) => {
              const index = Math.round(self.progress * (cards.length - 1));
              if (index !== activeIndex) {
                activeIndex = index;
                gsap.to(cards, {
                  opacity: 0.35,
                  y: 12,
                  duration: 0.3,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(cards[index], {
                  opacity: 1,
                  y: 0,
                  duration: 0.35,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(media, {
                  autoAlpha: 0,
                  scale: 0.98,
                  duration: 0.3,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(media[index], {
                  autoAlpha: 1,
                  scale: 1,
                  duration: 0.35,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
              }
            },
          },
        });

        // Translate the cards track upward as the user scrolls.
        timeline.to(cardsTrack, {
          y: -scrollDistance,
          ease: "none",
        });
      }

      // Fade pinned content in/out as the section enters/leaves the viewport.
      const fadeTargets = gsap.utils.toArray<HTMLElement>("[data-scroll-fade]");
      fadeTargets.forEach((target) => {
        gsap.set(target, { opacity: 0, scale: 0.95, filter: "blur(10px)" });
        ScrollTrigger.create({
          trigger: target,
          start: "top 85%",
          end: "bottom 15%",
          onEnter: () =>
            gsap.to(target, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.8, ease: "power3.out" }),
          onLeave: () =>
            gsap.to(target, { opacity: 0, scale: 0.95, filter: "blur(10px)", duration: 0.6, ease: "power3.in" }),
          onEnterBack: () =>
            gsap.to(target, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.8, ease: "power3.out" }),
          onLeaveBack: () =>
            gsap.to(target, { opacity: 0, scale: 0.95, filter: "blur(10px)", duration: 0.6, ease: "power3.in" }),
        });
      });

      ScrollTrigger.refresh();
    }, sectionRef);

    return () => context.revert();
  }, [steps.length, isMobile]);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      data-cursor-color="#003949"
      className="relative px-4 sm:px-6 py-16 sm:py-24 md:py-36 bg-white text-[#003949]"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-10 lg:mb-16" data-scroll-fade>
          <h2 className="text-3xl sm:text-4xl md:text-6xl mb-4 font-serif-custom font-semibold">
            How Ante works
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-[#003949]/70 max-w-3xl mx-auto">
            The screen locks, the cards move, and your accountability stays in focus.
          </p>
        </div>

        {/* Pinned grid container to keep the title outside the pin area. */}
        <div ref={pinRef} className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-10 items-start pt-6 lg:pt-12">
          <div className="relative">
            <div ref={cardsTrackRef} className="flex flex-col gap-6">
              {steps.map((step, index) => (
                <article
                  key={step.title}
                  data-how-card
                  data-scroll-fade
                  className="rounded-[24px] lg:rounded-[32px] bg-[#E5F1F4] p-6 sm:p-8 md:p-10"
                >
                  <div className="text-sm uppercase tracking-[0.3em] text-[#003949]/50 mb-3">
                    Step {index + 1}
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-serif-custom font-semibold mb-4">
                    {step.title}
                  </h3>
                  <p className="text-base md:text-lg text-[#003949]/70">
                    {step.description}
                  </p>
                  {/* Inline step image visible only on mobile (below lg) */}
                  <div className="mt-6 rounded-2xl overflow-hidden bg-[#E8F2F4] lg:hidden">
                    <Image
                      src={step.image}
                      alt={step.title}
                      width={520}
                      height={640}
                      className="w-full h-auto object-cover"
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Separate media track only visible on desktop (lg+) */}
          <div className="relative min-h-130 overflow-hidden hidden lg:block" ref={mediaTrackRef}>
            {steps.map((step) => (
              <div
                key={step.image}
                data-how-media
                className="absolute inset-0 rounded-[36px] overflow-hidden bg-[#E8F2F4]"
              >
                <Image
                  src={step.image}
                  alt={step.title}
                  width={520}
                  height={640}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
