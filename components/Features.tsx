"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

// Feature grid showcasing Ante capabilities with GSAP fades.
export function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  const features = useMemo(
    () => [
      {
        title: "Verify Friends",
        description: "Make sure they also aren’t being lazy.",
        image: "https://placehold.co/420x280/png?text=Verify+Friends",
      },
      {
        title: "Set reminders",
        description: "So you don’t forget you should be off your phone.",
        image: "https://placehold.co/420x280/png?text=Reminders",
      },
      {
        title: "Set an Ante",
        description: "Pay for your laziness, literally.",
        image: "https://placehold.co/420x280/png?text=Set+an+Ante",
      },
      {
        title: "Set lists",
        description: "Organise everything in one clean view.",
        image: "https://placehold.co/420x280/png?text=Lists",
      },
      {
        title: "Add custom emojis",
        description: "Make every task unique.",
        image: "https://placehold.co/420x280/png?text=Custom+Emojis",
      },
    ],
    []
  );

  useLayoutEffect(() => {
    if (!sectionRef.current) {
      return;
    }

    const context = gsap.context(() => {
      ensureGsapEase();
      // Fade the grid cards in sequentially as the section scrolls into view.
      gsap.from("[data-feature-card]", {
        opacity: 0,
        scale: 0.95,
        filter: "blur(10px)",
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
        },
      });

      // Fade elements in/out as they enter and leave the viewport.
      const fadeTargets = gsap.utils.toArray<HTMLElement>("[data-scroll-fade]");
      fadeTargets.forEach((target) => {
        gsap.set(target, { opacity: 0, scale: 0.95, filter: "blur(10px)" });
        ScrollTrigger.create({
          trigger: target,
          start: "top 80%",
          end: "bottom 20%",
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
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      id="features"
      ref={sectionRef}
      data-cursor-color="#003949"
      className="relative px-6 py-12 md:py-24 bg-white text-[#003949]"
    >
      <div className="container mx-auto max-w-6xl relative">
        <div className="mb-12 text-center" data-scroll-fade>
          <h2 className="text-4xl md:text-6xl mb-4 font-serif-custom font-semibold">
            What else can Ante do?
          </h2>
          <p className="text-lg md:text-xl text-[#003949]/70">
            Everything you need to keep yourself (and your friends) honest.
          </p>
        </div>

        <div
          className="grid justify-center"
          style={{
            gridTemplateColumns: "repeat(2, 30vw)",
            columnGap: "5vw",
            rowGap: "5vw",
            paddingLeft: "17.5vw",
            paddingRight: "17.5vw",
          }}
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              data-feature-card
              data-scroll-fade
              className="rounded-[28px] bg-[#E0F0F3] p-5 flex flex-col justify-between w-[30vw] h-[30vw]"
            >
              <div>
                <h3 className="text-2xl md:text-3xl font-serif-custom font-semibold mb-3">
                  {feature.title}
                </h3>
                <p className="text-base md:text-lg text-[#003949]/70">
                  {feature.description}
                </p>
              </div>
              <div className="mt-6 rounded-2xl overflow-hidden bg-white">
                <Image
                  src={feature.image}
                  alt={feature.title}
                  width={420}
                  height={280}
                  className="w-full h-full object-cover"
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
