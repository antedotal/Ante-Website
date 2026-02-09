"use client";

import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

// Scroll-pinned How It Works section with borderless numbered timeline.
// On mobile (<lg), disables pin/scrub and uses simple fade-in with inline images.
export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const cardsTrackRef = useRef<HTMLDivElement>(null);
  const mediaTrackRef = useRef<HTMLDivElement>(null);
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

  // Subscribe to mobile breakpoint without synchronous setState in an effect.
  const isMobile = useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia("(max-width: 1023px)");
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false // SSR fallback — treat as desktop
  );

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
        // Mobile: simple fade-in per step, no pin/scrub.
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
        // Desktop: pinned scroll with synced steps and media.
        if (!mediaTrack) return;

        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        const media = gsap.utils.toArray<HTMLDivElement>("[data-how-media]");
        const numbers = gsap.utils.toArray<HTMLSpanElement>("[data-how-number]");
        const cardHeight = cards[0]?.offsetHeight || 0;
        const cardGap = 24;
        let activeIndex = -1;

        // Initialize: all steps dimmed, numbers muted.
        gsap.set(cards, { opacity: 0.35 });
        gsap.set(numbers, { color: "rgba(0, 164, 198, 0.15)" });
        gsap.set(media, { autoAlpha: 0 });

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

                // Dim all steps, then highlight active one.
                gsap.to(cards, {
                  opacity: 0.35,
                  duration: 0.3,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(cards[index], {
                  opacity: 1,
                  duration: 0.35,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });

                // Mute all numbers, then highlight active one.
                gsap.to(numbers, {
                  color: "rgba(0, 164, 198, 0.15)",
                  duration: 0.3,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(numbers[index], {
                  color: "rgba(0, 164, 198, 0.80)",
                  duration: 0.35,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });

                // Swap media images.
                gsap.to(media, {
                  autoAlpha: 0,
                  duration: 0.3,
                  ease: NATURAL_EASE,
                  overwrite: true,
                });
                gsap.to(media[index], {
                  autoAlpha: 1,
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

      ScrollTrigger.refresh();
    }, sectionRef);

    return () => context.revert();
  }, [steps.length, isMobile]);

  // Format step number as two digits (01, 02, etc.).
  const formatNumber = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      data-cursor-color="#1a1a1a"
      className="relative px-4 sm:px-6 py-16 sm:py-24 md:py-36 bg-[#FAFBFC] text-[#1a1a1a]"
    >
      <div className="container mx-auto max-w-6xl">
        {/* Section header */}
        <div className="text-center mb-10 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-6xl mb-4 font-serif-custom font-semibold">
            How Ante works
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-[#1a1a1a]/60 max-w-3xl mx-auto">
            The screen locks, the cards move, and your accountability stays in focus.
          </p>
        </div>

        {/* Pinned grid: left numbered timeline + right media viewport. */}
        <div ref={pinRef} className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-10 items-start pt-6 lg:pt-12">
          {/* Left column: steps with large numbers and connector lines */}
          <div className="relative">
            <div ref={cardsTrackRef} className="flex flex-col gap-6">
              {steps.map((step, index) => (
                <article
                  key={step.title}
                  data-how-card
                  className="relative pl-16 sm:pl-20 py-4"
                >
                  {/* Large step number */}
                  <span
                    data-how-number
                    className="absolute left-0 top-2 text-5xl sm:text-6xl font-serif-custom font-bold text-[#00A4C6]/15 leading-none select-none transition-colors duration-300"
                  >
                    {formatNumber(index)}
                  </span>

                  <h3 className="text-xl sm:text-2xl font-serif-custom font-semibold mb-2">
                    {step.title}
                  </h3>
                  <p className="text-base text-[#1a1a1a]/60">
                    {step.description}
                  </p>

                  {/* Connector line between steps (not on last step) */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-8 sm:left-10 top-[calc(100%+0px)] w-[1px] h-6 bg-[#1a1a1a]/10" />
                  )}

                  {/* Inline step image visible only on mobile (below lg) */}
                  <div className="mt-6 rounded-xl overflow-hidden bg-[#F0F0F0] lg:hidden">
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

          {/* Right column: synced media viewport (desktop only) */}
          <div className="relative min-h-130 overflow-hidden hidden lg:block" ref={mediaTrackRef}>
            {steps.map((step) => (
              <div
                key={step.image}
                data-how-media
                className="absolute inset-0 rounded-xl overflow-hidden bg-[#F0F0F0]"
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
