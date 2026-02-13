"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";

interface CursorOptions {
    /** Whether the custom cursor is active. Set to false to restore the native cursor. */
    enabled?: boolean;
    defaultColor?: string;
    hoverScale?: number;
}

const DEFAULT_CURSOR_COLOR = "#ffffff";

/**
 * Custom animated cursor with GSAP-driven dot + ring.
 * Pass `enabled={false}` to disable and restore the browser's native cursor.
 */
export function CustomCursor({
    enabled = true,
    defaultColor = DEFAULT_CURSOR_COLOR,
    hoverScale = 1.6,
}: CursorOptions) {
    const cursorRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);

    // Toggle `data-custom-cursor` on <body> so CSS can hide/show the native cursor.
    useEffect(() => {
        if (enabled) {
            document.body.setAttribute("data-custom-cursor", "true");
        } else {
            document.body.removeAttribute("data-custom-cursor");
        }
        return () => {
            document.body.removeAttribute("data-custom-cursor");
        };
    }, [enabled]);

    useEffect(() => {
        // Skip all event listeners when the cursor is disabled.
        if (!enabled) return;

        const cursor = cursorRef.current;
        const ring = ringRef.current;

        if (!cursor || !ring) {
            return;
        }

        ensureGsapEase();

        // Use GSAP quick setters for smooth cursor motion.
        const setCursorX = gsap.quickTo(cursor, "x", { duration: 0.2, ease: NATURAL_EASE });
        const setCursorY = gsap.quickTo(cursor, "y", { duration: 0.2, ease: NATURAL_EASE });
        const setRingX = gsap.quickTo(ring, "x", { duration: 0.35, ease: NATURAL_EASE });
        const setRingY = gsap.quickTo(ring, "y", { duration: 0.35, ease: NATURAL_EASE });

        let currentColor = defaultColor;

        const handlePointerMove = (event: PointerEvent) => {
            setCursorX(event.clientX);
            setCursorY(event.clientY);
            setRingX(event.clientX);
            setRingY(event.clientY);

            const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
            const colorSource = target?.closest<HTMLElement>("[data-cursor-color]");
            const nextColor = colorSource?.dataset.cursorColor || defaultColor;

            if (nextColor !== currentColor) {
                currentColor = nextColor;
                // Animate cursor color to match the active background.
                gsap.to([cursor, ring], {
                    backgroundColor: currentColor,
                    borderColor: currentColor,
                    duration: 0.3,
                    ease: NATURAL_EASE,
                });
            }
        };

        const handlePointerOver = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            const isInteractive = Boolean(target?.closest("a, button, [data-cursor-hover]"));

            if (isInteractive) {
                // Enlarge cursor when hovering interactive elements.
                gsap.to(cursor, { scale: hoverScale, duration: 0.2, ease: NATURAL_EASE });
                gsap.to(ring, { scale: hoverScale, duration: 0.25, ease: NATURAL_EASE });
            }
        };

        const handlePointerOut = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            const isInteractive = Boolean(target?.closest("a, button, [data-cursor-hover]"));

            if (isInteractive) {
                // Restore cursor size after leaving interactive elements.
                gsap.to(cursor, { scale: 1, duration: 0.2, ease: NATURAL_EASE });
                gsap.to(ring, { scale: 1, duration: 0.25, ease: NATURAL_EASE });
            }
        };

        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        document.addEventListener("pointerover", handlePointerOver);
        document.addEventListener("pointerout", handlePointerOut);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerover", handlePointerOver);
            document.removeEventListener("pointerout", handlePointerOut);
        };
    }, [enabled, defaultColor, hoverScale]);

    // Don't render any cursor elements when disabled.
    if (!enabled) return null;

    return (
        <div className="custom-cursor" aria-hidden="true">
            {/* Primary dot follows the pointer precisely. */}
            <div ref={cursorRef} className="custom-cursor__dot" />
            {/* Soft ring trails behind for depth and motion. */}
            <div ref={ringRef} className="custom-cursor__ring" />
        </div>
    );
}
