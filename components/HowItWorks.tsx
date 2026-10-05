"use client";

import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import paymentHoldMockup from "@/components/images/payment_hold_mockup.png";
import getVerifiedOrPay from "@/components/images/task_verification_mockup.png";
import addFriendsMockup from "@/components/images/add-friend-mockup-frame.png";
import stepBg3 from "@/components/images/bg3.png";
import stepBg2 from "@/components/images/bg2.png";
import stepBg1 from "@/components/images/bg1.png";
import inTaskMenu from "@/components/images/in_task_menu_mockup.png";
import taskFailed from "@/components/images/task_failed.png"

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
        image: addFriendsMockup,
        bg: stepBg1,
      },
      {
        title: "Set the Ante",
        image: paymentHoldMockup,
        bg: stepBg2,
      },
      {
        title: "Do the damn task",
        image: inTaskMenu,
        bg: stepBg3,
      },
      {
        title: "Submit proof",
        image: getVerifiedOrPay,
        bg: stepBg1,
      },
      {
        title: "Get verified (or pay)",
        image: taskFailed,
        bg: stepBg2,
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
        // Desktop: pinned scroll with continuous scrubbed timeline.
        // Direct scrubbed tweens provide native-refresh 60/120fps crossfades without frame drops,
        // discrete jumps, or auto-snap conflicts.
        if (!mediaTrack) return;

        const cards = gsap.utils.toArray<HTMLDivElement>("[data-how-card]");
        const media = gsap.utils.toArray<HTMLDivElement>("[data-how-media]");
        const numbers = gsap.utils.toArray<HTMLSpanElement>("[data-how-number]");

        // Set initial state: step 0 active, rest dimmed.
        gsap.set(cards, { opacity: 0.25 });
        gsap.set(cards[0], { opacity: 1 });
        gsap.set(numbers, { color: "rgba(74, 139, 159, 0.20)" });
        gsap.set(numbers[0], { color: "rgba(74, 139, 159, 0.90)" });
        gsap.set(media, { autoAlpha: 0, scale: 0.97 });
        gsap.set(media[0], { autoAlpha: 1, scale: 1 });

        // Scroll distance to give each step comfortable breathing room.
        const scrollDistance = (cards.length - 1) * 350;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "center center",
            end: `+=${scrollDistance}`,
            scrub: 0.8,
            pin: true,
            anticipatePin: 1,
          },
        });

        // Add smooth sequential crossfades across the 5 steps
        for (let i = 0; i < cards.length - 1; i++) {
          const stepTl = gsap.timeline();

          // Fade out current step
          stepTl.to(cards[i], { opacity: 0.25, duration: 1, ease: "power1.inOut" }, 0);
          stepTl.to(numbers[i], { color: "rgba(74, 139, 159, 0.20)", duration: 1, ease: "power1.inOut" }, 0);
          stepTl.to(media[i], { autoAlpha: 0, scale: 0.97, duration: 1, ease: "power1.inOut" }, 0);

          // Fade in next step
          stepTl.to(cards[i + 1], { opacity: 1, duration: 1, ease: "power1.inOut" }, 0.2);
          stepTl.to(numbers[i + 1], { color: "rgba(74, 139, 159, 0.90)", duration: 1, ease: "power1.inOut" }, 0.2);
          stepTl.to(media[i + 1], { autoAlpha: 1, scale: 1, duration: 1, ease: "power1.inOut" }, 0.2);

          // Hold duration on current step before beginning next transition
          stepTl.to({}, { duration: 0.5 });

          tl.add(stepTl);
        }
      }

      ScrollTrigger.refresh();
    }, sectionRef);

    return () => {
      context.revert();
    };
  }, [steps.length, isMobile]);

  // Format step number as two digits (01, 02, etc.).
  const formatNumber = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      data-cursor-color="#1a1a1a"
      className="relative px-4 sm:px-6 py-12 md:py-20 min-h-screen bg-[#FAFBFC] text-[#1a1a1a] flex items-center justify-center"
    >
      <div className="container mx-auto max-w-6xl w-full">
        {/* Pinned container: title + grid both pin together at viewport center */}
        <div ref={pinRef} className="py-4 md:py-8 flex flex-col justify-center w-full">
          {/* Section header — inside pinRef so it stays visible when pinned */}
          <div className="text-center mb-4 lg:mb-8">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif-custom font-semibold">
              Let&apos;s fix that.
            </h2>
          </div>

          {/* Pinned grid: left numbered timeline + right media viewport. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 lg:gap-10 items-start pt-2 lg:pt-6">
            {/* Left column: all steps visible, highlight shifts on scroll */}
            <div className="relative">
              <div className="flex flex-col gap-3 sm:gap-4">
                {steps.map((step, index) => (
                  <article
                    key={step.title}
                    data-how-card
                    className="relative flex items-start lg:items-center gap-4 sm:gap-6 py-3 sm:py-4"
                  >
                    {/* Dedicated step number column — guarantees zero overlap with text */}
                    <span
                      data-how-number
                      className="w-14 sm:w-18 shrink-0 text-3xl sm:text-4xl lg:text-5xl font-serif-custom font-bold text-[#4A8B9F]/20 leading-none select-none transition-colors duration-300 pt-0.5 lg:pt-0"
                    >
                      {formatNumber(index)}
                    </span>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl sm:text-2xl font-serif-custom font-semibold text-[#1a1a1a]">
                        {step.title}
                      </h3>

                      {/* Inline step image visible only on mobile (below lg) */}
                      <div className="relative mt-6 overflow-hidden rounded-2xl lg:hidden">
                        {/* Gradient backdrop to mask shadow edges */}
                        <Image
                          src={step.bg}
                          alt=""
                          fill
                          quality={60}
                          className="object-cover"
                          aria-hidden="true"
                        />
                        <Image
                          src={step.image}
                          alt={step.title}
                          width={1040}
                          height={1280}
                          quality={90}
                          sizes="(max-width: 640px) 180vw, 1040px"
                          className="relative w-full h-auto object-cover"
                        />
                      </div>
                    </div>

                    {/* Connector line between steps (not on last step) */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-7 sm:left-9 top-[calc(100%-2px)] w-px h-5 bg-[#1a1a1a]/10" />
                    )}
                  </article>
                ))}
              </div>
            </div>

            {/* Right column: synced media viewport (desktop only) */}
            <div className="relative min-h-96 hidden lg:block overflow-hidden rounded-3xl" ref={mediaTrackRef}>
              {steps.map((step) => (
                <div
                  key={step.title}
                  data-how-media
                  className="absolute inset-0"
                >
                  {/* Gradient backdrop to mask shadow edges */}
                  <Image
                    src={step.bg}
                    alt=""
                    fill
                    quality={60}
                    className="object-cover"
                    aria-hidden="true"
                  />
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={1040}
                    height={1280}
                    quality={100}
                    sizes="1040px"
                    className="relative h-full w-full object-cover"
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
