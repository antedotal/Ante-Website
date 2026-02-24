"use client";

import React, { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ensureGsapEase } from "@/lib/gsap";

gsap.registerPlugin(ScrollTrigger);

// Helper to split text into words wrapped in spans
const WordSplitter = ({ children }: { children: React.ReactNode }) => {
    const split = (node: React.ReactNode): React.ReactNode => {
        if (typeof node === 'string') {
            return node.split(/(\s+)/).map((word, i) => {
                if (word.trim() === '') return word;
                return <span key={i} className="word opacity-20 transition-colors duration-300">{word}</span>;
            });
        }
        if (React.isValidElement(node)) {
            return React.cloneElement(node as React.ReactElement<{ children?: React.ReactNode }>, {
                children: React.Children.map((node.props as { children?: React.ReactNode }).children, split)
            });
        }
        if (Array.isArray(node)) {
            return node.map((child, i) => <React.Fragment key={i}>{split(child)}</React.Fragment>);
        }
        return node;
    };
    return <>{split(children)}</>;
};

export function CopySection() {
    const sectionRef = useRef<HTMLElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!innerRef.current || !sectionRef.current) return;
        ensureGsapEase();

        const context = gsap.context(() => {
            const words = gsap.utils.toArray(".word");

            gsap.to(words, {
                opacity: 1,
                stagger: 0.1,
                ease: "none",
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "center center",
                    end: "+=100%",
                    pin: true,
                    scrub: 0.5,
                }
            });
        }, sectionRef);

        return () => context.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            id="why-ante"
            data-cursor-color="#1a1a1a"
            className="relative px-4 sm:px-6 pt-24 sm:pt-32 md:pt-40 pb-12 sm:pb-16 md:pb-20 bg-[#FAFBFC] text-[#1a1a1a] flex items-center justify-center"
        >
            <div ref={innerRef} className="container mx-auto max-w-3xl text-justify">
                <WordSplitter>
                    {/* Main headline */}
                    <h2 className="text-4xl sm:text-5xl md:text-6xl font-serif-custom font-semibold leading-[1.1] mb-4 sm:mb-6 text-center">
                        You suck at keeping yourself accountable.
                    </h2>

                    {/* Hook */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        Your friends aren&apos;t forgiving. Neither is your wallet.
                    </p>

                    {/* Build-up */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        Look, we get it. You&apos;ve got goals. You&apos;ve told people about them. You&apos;ve hyped yourself up.
                    </p>

                    {/* Gut-punch */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        But when it comes to actually doing? You fold.
                    </p>

                    {/* Shame stack */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        Too tired. Too busy. Too incompetent.
                    </p>
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        Now everyone sees the gap between who you say you are — and what you actually do.
                    </p>

                    {/* Redemptive turn */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug mb-4">
                        But here&apos;s the truth: you <em>are</em> capable. It&apos;s just your systems that suck.
                    </p>

                    {/* Closer */}
                    <p className="text-xl md:text-2xl font-sans-flex leading-snug text-center">

                    </p>
                </WordSplitter>
            </div>
        </section>
    );
}
