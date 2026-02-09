"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ensureGsapEase, NATURAL_EASE } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface MagneticButtonProps {
    children: React.ReactNode;
    className?: string;
    strength?: number;
}

// Magnetic wrapper that nudges its children toward the pointer.
export function MagneticButton({ children, className, strength = 16 }: MagneticButtonProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        // Skip magnetic effect on touch devices (no fine pointer).
        if (!window.matchMedia("(pointer: fine)").matches) {
            return;
        }

        ensureGsapEase();

        // GSAP quick setters for the magnetic motion toward the pointer.
        const setX = gsap.quickTo(element, "x", { duration: 0.4, ease: NATURAL_EASE });
        const setY = gsap.quickTo(element, "y", { duration: 0.4, ease: NATURAL_EASE });

        const handleMove = (event: MouseEvent) => {
            const bounds = element.getBoundingClientRect();
            const offsetX = event.clientX - (bounds.left + bounds.width / 2);
            const offsetY = event.clientY - (bounds.top + bounds.height / 2);

            setX((offsetX / bounds.width) * strength);
            setY((offsetY / bounds.height) * strength);
        };

        const handleLeave = () => {
            setX(0);
            setY(0);
        };

        element.addEventListener("mousemove", handleMove);
        element.addEventListener("mouseleave", handleLeave);

        return () => {
            element.removeEventListener("mousemove", handleMove);
            element.removeEventListener("mouseleave", handleLeave);
        };
    }, [strength]);

    return (
        <div ref={containerRef} className={cn("inline-block", className)} data-cursor-hover="true">
            {children}
        </div>
    );
}
