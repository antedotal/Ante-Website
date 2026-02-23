"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

export function CopySection() {
    const sectionRef = useRef<HTMLElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!innerRef.current) return;
        ensureGsapEase();

        const context = gsap.context(() => {
            const scrollTrigger = {
                trigger: innerRef.current,
                start: "top 80%",
            };

            // Standard lines — gentle fade-up stagger
            gsap.from("[data-text-section-item]", {
                opacity: 0,
                y: 28,
                duration: 0.85,
                ease: NATURAL_EASE,
                stagger: 0.13,
                scrollTrigger,
            });

            // Gut-punch lines — snap in hard with overshoot, then pulse the red word
            gsap.from("[data-punch]", {
                opacity: 0,
                y: 20,
                duration: 0.55,
                ease: "back.out(1.8)",
                stagger: 0.1,
                delay: 0.6, // lands after the build-up lines
                scrollTrigger,
                onComplete() {
                    // Brief color flash on the red span to make it sting
                    gsap.fromTo(
                        "[data-punch-word]",
                        { color: "#FF6B6B" },
                        {
                            color: "#E53E3E",
                            duration: 0.6,
                            ease: "power2.inOut",
                            repeat: 1,
                            yoyo: true,
                        }
                    );
                },
            });
        }, sectionRef);

        return () => context.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            id="why-ante"
            data-cursor-color="#1a1a1a"
            className="relative px-4 sm:px-6 py-20 sm:py-28 md:py-36 bg-[#FAFBFC] text-[#1a1a1a]"
        >
            <div ref={innerRef} className="container mx-auto max-w-3xl text-center">
                {/* Eyebrow */}
                <p
                    data-text-section-item
                    className="uppercase tracking-[0.2em] text-[#00A4C6] text-xs sm:text-sm font-medium mb-6"
                >
                    STOP BREAKING YOUR OWN PROMISES.
                </p>

                {/* Main headline */}
                <h2
                    data-text-section-item
                    className="text-3xl sm:text-4xl md:text-6xl font-serif-custom font-semibold leading-[1.1] mb-6 sm:mb-8"
                >
                    You{" "}
                    <span className="text-[#E53E3E]">suck</span>
                    {" "}at keeping yourself accountable.
                </h2>

                {/* Hook */}
                <p
                    data-text-section-item
                    className="text-lg md:text-xl text-[#1a1a1a]/70 font-medium leading-relaxed mb-8"
                >
                    Your friends aren&apos;t forgiving. Neither is your wallet.
                </p>

                {/* Build-up */}
                <p
                    data-text-section-item
                    className="text-base md:text-lg text-[#1a1a1a]/50 leading-relaxed mb-3"
                >
                    Look, we get it. You&apos;ve got goals. You&apos;ve told people about them. You&apos;ve hyped yourself up.
                </p>

                {/* Gut-punch — snaps in hard */}
                <p
                    data-punch
                    className="text-lg md:text-xl text-[#1a1a1a] font-semibold leading-relaxed mb-8"
                >
                    But when it comes to actually doing?{" "}
                    <span data-punch-word className="text-[#E53E3E]">You fold.</span>
                </p>

                {/* Shame stack */}
                <p
                    data-text-section-item
                    className="text-base md:text-lg text-[#1a1a1a]/50 leading-relaxed mb-2"
                >
                    Too tired. Too busy. Too incompetent.
                </p>
                <p
                    data-text-section-item
                    className="text-base md:text-lg text-[#1a1a1a]/50 leading-relaxed mb-10"
                >
                    Now everyone sees the gap between who you say you are — and what you actually do.
                </p>

                {/* Redemptive turn */}
                <p
                    data-text-section-item
                    className="text-base md:text-lg text-[#00A4C6] font-medium leading-relaxed mb-3"
                >
                    But here&apos;s the truth: you <em>are</em> capable. It&apos;s just your systems that suck.
                </p>

                {/* Closer — also punches in */}
                <p
                    data-punch
                    className="text-lg md:text-xl font-semibold text-[#1a1a1a] leading-snug"
                >
                    So stop lying. Put your money where your mouth is.
                </p>
            </div>
        </section>
    );
}
