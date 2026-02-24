"use client";

import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import verifyFriendsImg from "@/components/images/task_verification_mockup.png";
import remindersImg from "@/components/images/Mockup - Ante - Reminders.png";
import setAnteImg from "@/components/images/payment_hold_mockup.png";
import listsImg from "@/components/images/inlist_mockup.png";
import customEmojisImg from "@/components/images/Mockup - Ante - Emojis.png";

gsap.registerPlugin(ScrollTrigger);

// Horizontal scroll feature showcase with automatic slow-scroll animation.
// Section header fades in on scroll enter; cards auto-scroll when visible.
export function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(false);

  const features = useMemo(
    () => [
      {
        label: "Accountability",
        title: "Verify Friends",
        description: "Make sure they also aren't being lazy.",
        image: verifyFriendsImg,
      },
      {
        label: "Reminders",
        title: "Set reminders",
        description: "So you don't forget you should be off your phone.",
        image: remindersImg,
      },
      {
        label: "Stakes",
        title: "Set an Ante",
        description: "Pay for your laziness, literally.",
        image: setAnteImg,
      },
      {
        label: "Organisation",
        title: "Set lists",
        description: "Organise everything in one clean view.",
        image: listsImg,
      },
      {
        label: "Personalisation",
        title: "Add custom emojis",
        description: "Make every task unique.",
        image: customEmojisImg,
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

  // Reference to the inner track so we can measure one full set of cards.
  const trackRef = useRef<HTMLDivElement>(null);

  // Continuous auto-scroll when section is visible. Pauses on hover/touch.
  // Cards are duplicated in the DOM so the second set fills the gap while
  // we silently reset scrollLeft, creating a seamless infinite loop.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!container || !section || !track) return;

    let isHovering = false;
    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;
    let exactScrollLeft = 0;
    let lastProgrammaticScroll = 0;

    // IntersectionObserver to start/stop auto-scroll based on visibility.
    const observer = new IntersectionObserver(
      ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
      { threshold: 0.15 }
    );
    observer.observe(section);

    // Pause auto-scroll while the user is interacting with the carousel.
    const handleInteractionStart = () => { 
      isHovering = true; 
      isScrolling = true;
      clearTimeout(scrollTimeout);
    };
    
    const handleInteractionEnd = () => { 
      isHovering = false; 
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        // Sync our accumulator with the final user scroll position
        exactScrollLeft = container.scrollLeft;
      }, 1000);
    };

    const handleWheel = () => {
      isScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        exactScrollLeft = container.scrollLeft;
      }, 1000);
    };

    const handleScroll = () => {
      // Ignore scroll events that were triggered by our own programmatic scrolling
      if (Date.now() - lastProgrammaticScroll < 50) {
        return;
      }
      
      isScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        exactScrollLeft = container.scrollLeft;
      }, 1000);
    };

    container.addEventListener("pointerenter", handleInteractionStart);
    container.addEventListener("pointerleave", handleInteractionEnd);
    container.addEventListener("touchstart", handleInteractionStart, { passive: true });
    container.addEventListener("touchend", handleInteractionEnd);
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Start halfway through the carousel
    setTimeout(() => {
      if (container && track && track.children.length >= features.length * 2) {
        const firstChild = track.children[0] as HTMLElement;
        const secondSetFirstChild = track.children[features.length] as HTMLElement;
        const oneSetWidth = secondSetFirstChild.offsetLeft - firstChild.offsetLeft;
        // Start in the middle of the sets (at the 3rd set)
        exactScrollLeft = oneSetWidth * 2;
        lastProgrammaticScroll = Date.now();
        container.scrollLeft = exactScrollLeft;
      }
    }, 100);

    const speed = 0.6; // px per frame (~36px/sec at 60fps)
    let rafId: number;

    const tick = () => {
      if (!container || !track || track.children.length < features.length * 2) return;

      const firstChild = track.children[0] as HTMLElement;
      const secondSetFirstChild = track.children[features.length] as HTMLElement;
      const oneSetWidth = secondSetFirstChild.offsetLeft - firstChild.offsetLeft;
      
      // Handle infinite looping in both directions
      // We have 6 sets. We want to keep the scroll position between set 2 and set 4.
      // We do this even when scrolling so the user never hits the end
      if (container.scrollLeft >= oneSetWidth * 3) {
        exactScrollLeft = container.scrollLeft - oneSetWidth;
        lastProgrammaticScroll = Date.now();
        container.scrollLeft = exactScrollLeft;
      } else if (container.scrollLeft <= oneSetWidth) {
        exactScrollLeft = container.scrollLeft + oneSetWidth;
        lastProgrammaticScroll = Date.now();
        container.scrollLeft = exactScrollLeft;
      }

      if (!isScrolling && isVisibleRef.current && !isHovering) {
        exactScrollLeft += speed;
        lastProgrammaticScroll = Date.now();
        container.scrollLeft = exactScrollLeft;
      }
      
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(scrollTimeout);
      observer.disconnect();
      container.removeEventListener("pointerenter", handleInteractionStart);
      container.removeEventListener("pointerleave", handleInteractionEnd);
      container.removeEventListener("touchstart", handleInteractionStart);
      container.removeEventListener("touchend", handleInteractionEnd);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [features.length]);

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

      {/* Horizontal auto-scroll container — pauses on hover, loops seamlessly.
          Cards are rendered multiple times so the sets fill the viewport while
          scrollLeft silently resets, preventing any visible jump. */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto pb-8"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div
          ref={trackRef}
          className="flex gap-4 md:gap-8 px-4 md:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]"
        >
          {/* Render cards 6 times for seamless infinite loop even on ultrawide screens */}
          {[...features, ...features, ...features, ...features, ...features, ...features].map((feature, i) => (
            <article
              key={`${feature.title}-${i}`}
              className="w-[65vw] max-w-[280px] sm:min-w-70 md:min-w-105 shrink-0"
            >
              {/* Feature image */}
              <div className="rounded-xl bg-[#F0F0F0] aspect-4/3 overflow-hidden mb-3 md:mb-6">
                <Image
                  src={feature.image}
                  alt={feature.title}
                  width={560}
                  height={420}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Feature label */}
              <span className="text-[10px] md:text-sm uppercase tracking-[0.15em] text-[#00A4C6] font-medium">
                {feature.label}
              </span>

              {/* Feature title */}
              <h3 className="text-lg md:text-2xl font-serif-custom font-semibold text-[#1a1a1a] mt-1 md:mt-2">
                {feature.title}
              </h3>

              {/* Feature description */}
              <p className="text-xs md:text-base text-[#1a1a1a]/60 mt-1 md:mt-2">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
