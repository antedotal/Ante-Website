import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

// Track whether the custom ease has been registered once per runtime.
let hasRegistered = false;

export const NATURAL_EASE = "natural-ease";

// Shared reveal animation defaults for scroll-triggered entrances.
export const REVEAL_Y = { opacity: 0, y: 40, duration: 0.9, ease: NATURAL_EASE };
export const REVEAL_STAGGER = 0.12;

// Ensure the shared bezier ease is registered before animations run.
export const ensureGsapEase = () => {
    if (hasRegistered) {
        return;
    }

    // Register a custom bezier ease — quint ease-out for pronounced deceleration.
    gsap.registerPlugin(CustomEase);
    CustomEase.create(NATURAL_EASE, "0.23, 1, 0.32, 1");
    hasRegistered = true;
};
