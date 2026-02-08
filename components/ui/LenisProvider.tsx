"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Initializes Lenis smooth scrolling for the entire page.
export function LenisProvider() {
    useEffect(() => {
        const lenis = new Lenis({
            lerp: 0.08,
            smoothWheel: true,
            smoothTouch: false,
        });

        let frameId = 0;

        const raf = (time: number) => {
            lenis.raf(time);
            frameId = requestAnimationFrame(raf);
        };

        frameId = requestAnimationFrame(raf);

        return () => {
            cancelAnimationFrame(frameId);
            lenis.destroy();
        };
    }, []);

    return null;
}
