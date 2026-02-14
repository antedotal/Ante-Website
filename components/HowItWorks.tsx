"use client";

import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import setAnteMockup from "@/components/images/Mockup - Ante- SetAnte.png";

gsap.registerPlugin(ScrollTrigger);

// Scroll-pinned How It Works section with borderless numbered timeline.
// Desktop: left column stays static, active step highlights on scroll. Right media crossfades in sync.
// Mobile (<lg): disables pin/scrub and uses simple fade-in with inline images.
export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
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
        image: setAnteMockup,
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
    const mediaTrack = mediaTrackRef.current;
    const pinSection = pinRef.current;

    if (!sectionRef.current || !pinSection) {
      return;
    }

    // Cleanup for wheel event listener (assigned inside the desktop branch).
    let wheelCleanup: (() => void) | null = null;

    const context = gsap.context(() => {
      if (isMobile) {
        // Mobile: simple fade-in per step, no pin/scrub.
        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        cards.forEach((card) => {
          gsap.from(card, {
            opacity: 0,
            y: 24,
            duration: 0.8,
            ease: NATURAL_EASE,
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
            },
          });
        });
      } else {
        // Desktop: pinned scroll — left column stays fixed in place,
        // only the active step highlights as the user scrolls.
        // Right media viewport crossfades in sync.
        if (!mediaTrack) return;

        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        const media = gsap.utils.toArray<HTMLDivElement>("[data-how-media]");
        const numbers = gsap.utils.toArray<HTMLSpanElement>("[data-how-number]");
        const descriptions = gsap.utils.toArray<HTMLParagraphElement>("[data-how-desc]");
        let activeIndex = -1;

        // Enough scroll distance to move through all steps comfortably.
        const scrollDistance = cards.length * 250;

        // Initialize: first step active, rest dimmed.
        gsap.set(cards, { opacity: 0.25 });
        gsap.set(cards[0], { opacity: 1 });
        gsap.set(numbers, { color: "rgba(0, 164, 198, 0.15)" });
        gsap.set(numbers[0], { color: "rgba(0, 164, 198, 0.80)" });
        gsap.set(descriptions, { opacity: 0.5 });
        gsap.set(descriptions[0], { opacity: 1 });
        gsap.set(media, { autoAlpha: 0 });
        gsap.set(media[0], { autoAlpha: 1 });
        activeIndex = 0;

        // Empty timeline — we only use the ScrollTrigger callbacks,
        // not timeline-driven transforms, since the left side is static.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pinSection,
            start: "top top",
            end: `+=${scrollDistance}`,
            scrub: true,
            pin: pinSection,
            anticipatePin: 1,
            onUpdate: (self) => {
              const index = Math.min(
                Math.floor(self.progress * cards.length),
                cards.length - 1
              );
              if (index === activeIndex) return;
              activeIndex = index;

              // Dim all step cards, then highlight the active one.
              gsap.to(cards, {
                opacity: 0.25,
                duration: 0.35,
                ease: NATURAL_EASE,
                overwrite: true,
              });
              gsap.to(cards[index], {
                opacity: 1,
                duration: 0.4,
                ease: NATURAL_EASE,
                overwrite: true,
              });

              // Dim all descriptions, highlight active.
              gsap.to(descriptions, {
                opacity: 0.5,
                duration: 0.35,
                ease: NATURAL_EASE,
                overwrite: true,
              });
              gsap.to(descriptions[index], {
                opacity: 1,
                duration: 0.4,
                ease: NATURAL_EASE,
                overwrite: true,
              });

              // Mute all numbers, highlight active.
              gsap.to(numbers, {
                color: "rgba(0, 164, 198, 0.15)",
                duration: 0.35,
                ease: NATURAL_EASE,
                overwrite: true,
              });
              gsap.to(numbers[index], {
                color: "rgba(0, 164, 198, 0.80)",
                duration: 0.4,
                ease: NATURAL_EASE,
                overwrite: true,
              });

              // Crossfade media images with a subtle upward shift for emphasis.
              gsap.to(media, {
                autoAlpha: 0,
                y: 12,
                scale: 0.98,
                duration: 0.35,
                ease: NATURAL_EASE,
                overwrite: true,
              });
              gsap.fromTo(
                media[index],
                { autoAlpha: 0, y: 20, scale: 0.97 },
                {
                  autoAlpha: 1,
                  y: 0,
                  scale: 1,
                  duration: 0.5,
                  ease: NATURAL_EASE,
                  overwrite: true,
                }
              );
            },
          },
        });

        // --- Inertia removal ---
        // Intercept wheel events while the pinned section is active to prevent
        // trackpad/mouse momentum from accidentally skipping steps.
        // Batches all wheel deltas per animation frame, caps the applied amount,
        // and discards excess — killing momentum buildup entirely.
        // 10% transition zones at entry and exit preserve seamless native scrolling.
        const st = tl.scrollTrigger!;

        // Exit transition zone boundary (last 10% of final card's progress).
        const exitStart = 1 - (1 / cards.length) * 0.1;

        // Max pixels to scroll per animation frame — caps speed to prevent skipping.
        const MAX_FRAME_DELTA = 35;
        let pendingDelta = 0;
        let rafScheduled = false;

        const onWheel = (e: WheelEvent) => {
          if (!st.isActive) return;

          const progress = st.progress;

          // Exit transition zone: allow native scroll for seamless departure.
          // No entry zone — momentum from above is killed as soon as the pin engages.
          if (progress > exitStart) return;

          // Active zone — take over scroll to remove inertia.
          e.preventDefault();
          pendingDelta += e.deltaY;

          if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(() => {
              // Clamp the batched delta to cap scroll speed.
              const clamped =
                Math.sign(pendingDelta) *
                Math.min(Math.abs(pendingDelta), MAX_FRAME_DELTA);
              window.scrollBy(0, clamped);
              // Discard excess delta — this kills momentum/inertia buildup.
              pendingDelta = 0;
              rafScheduled = false;
            });
          }
        };

        window.addEventListener("wheel", onWheel, { passive: false });
        wheelCleanup = () => {
          window.removeEventListener("wheel", onWheel);
        };
      }

      ScrollTrigger.refresh();
    }, sectionRef);

    return () => {
      context.revert();
      wheelCleanup?.();
    };
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
        {/* Pinned container: title + grid both pin together so the heading stays visible during scroll-lock.
            Top padding ensures the title clears the fixed navbar when pinned to viewport top. */}
        <div ref={pinRef} className="pt-24 sm:pt-28">
          {/* Section header — inside pinRef so it stays visible when pinned */}
          <div className="text-center mb-4 lg:mb-8">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif-custom font-semibold">
              How Ante works
            </h2>
          </div>

          {/* Pinned grid: left numbered timeline + right media viewport. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-10 items-start pt-2 lg:pt-6">
          {/* Left column: all steps visible, highlight shifts on scroll */}
          <div className="relative">
            <div className="flex flex-col gap-6">
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

                  <h3 className="text-xl sm:text-2xl font-serif-custom font-semibold mb-0.5">
                    {step.title}
                  </h3>
                  <p data-how-desc className="text-base text-[#1a1a1a]/60 leading-snug">
                    {step.description}
                  </p>

                  {/* Connector line between steps (not on last step) */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-8 sm:left-10 top-[calc(100%+0px)] w-px h-6 bg-[#1a1a1a]/10" />
                  )}

                  {/* Inline step image visible only on mobile (below lg) */}
                  <div className="mt-6 rounded-xl overflow-hidden bg-[#F0F0F0] lg:hidden">
                    <Image
                      src={step.image}
                      alt={step.title}
                      width={1040}
                      height={1280}
                      quality={90}
                      sizes="(max-width: 640px) 90vw, 520px"
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
                key={step.title}
                data-how-media
                className="absolute inset-0 rounded-xl overflow-hidden bg-[#F0F0F0]"
              >
                <Image
                  src={step.image}
                  alt={step.title}
                  width={1040}
                  height={1280}
                  quality={90}
                  sizes="520px"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
