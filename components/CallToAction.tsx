"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ensureGsapEase } from "@/lib/gsap";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { ArrowRightIcon } from "@/components/ui/icons";

// Final CTA section with magnetic button and GSAP fade-in.
export function CallToAction() {
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const copyRef = useRef<HTMLParagraphElement>(null);
    const buttonRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        ensureGsapEase();

        const context = gsap.context(() => {
            // Sequential fade-in for CTA copy and button.
            gsap.from([headingRef.current, copyRef.current, buttonRef.current], {
                opacity: 0,
                scale: 0.95,
                filter: "blur(10px)",
                duration: 0.9,
                ease: "power3.out",
                stagger: 0.16,
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
            className="py-16 sm:py-20 md:py-32 px-4 sm:px-6 text-center relative overflow-hidden bg-[#003949]"
        >
            <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent pointer-events-none" />
            <div className="container mx-auto max-w-3xl relative z-10">
                <h2
                    ref={headingRef}
                    className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl mb-6 sm:mb-8 tracking-tight text-white font-serif-custom font-semibold"
                >
                    Ready to be a better person?
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
