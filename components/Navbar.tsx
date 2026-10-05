"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/**
 * Smooth-scroll to an anchor with fixed-navbar offset.
 * Purpose, functionality & implementation:
 * Uses the active Lenis instance (`window.__lenis.scrollTo`) when present so the programmatic
 * anchor jump is driven by the same unified GSAP ticker loop without stutter or conflicting native animations.
 * Falls back safely to standard `window.scrollTo` when Lenis is not available.
 */
function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (element) {
    const lenis = (window as unknown as { __lenis?: { scrollTo: (target: HTMLElement | string, options?: { offset?: number }) => void } }).__lenis;
    if (lenis) {
      lenis.scrollTo(element, { offset: -100 });
      return;
    }
    const offset = 100;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    window.scrollTo({ top: offsetPosition, behavior: "smooth" });
  }
}

// Navbar that starts as a full-width bar and morphs into a floating pill on scroll.
export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 50;
      if (scrolled !== isScrolled) {
        setIsScrolled(scrolled);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isScrolled]);

  // Close mobile menu on resize to desktop.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = () => {
      if (mql.matches) setIsMobileMenuOpen(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Handle nav link tap: scroll to section and close mobile menu.
  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      scrollToSection(id);
      setIsMobileMenuOpen(false);
    },
    []
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      {/* Container that morphs from full-width bar to floating pill.
          pointer-events-auto re-enables clicks only on the visible bar/pill,
          so the transparent area around the pill doesn't block page content. */}
      <motion.div
        className="flex items-center justify-between w-full backdrop-blur-md pointer-events-auto"
        initial={false}
        animate={isScrolled ? "pill" : "bar"}
        variants={{
          bar: {
            maxWidth: 1152, // 72rem = max-w-6xl
            borderRadius: 9999,
            backgroundColor: "rgba(74, 139, 159, 0)",
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 16,
            paddingRight: 16,
            marginTop: 0,
            boxShadow: "0 0 0 0 rgba(0,0,0,0)",
            borderColor: "rgba(255,255,255,0)",
          },
          pill: {
            maxWidth: 580,
            borderRadius: 9999,
            backgroundColor: "rgba(74, 139, 159, 0.92)",
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 16,
            paddingRight: 16,
            marginTop: 12,
            boxShadow: "0 4px 20px -2px rgba(74, 139, 159, 0.25)",
            borderColor: "rgba(255,255,255,0.15)",
          },
        }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        style={{ borderWidth: 1, borderStyle: "solid" }}
      >
        {/* Left section — flex-1 mirrors the right section width for true centering.
            min-w-0 allows proper shrinking if the container narrows. */}
        <div className="flex-1 min-w-0">
          {/* Brand — color transitions between Ante color (bar) and white (pill) */}
          <motion.div
            className="text-xl tracking-tighter font-immersive"
            animate={{ color: isScrolled ? "#ffffff" : "#4A8B9F" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <a href="#">Ante</a>
          </motion.div>
        </div>

        {/* Desktop nav links — centered between the two flex-1 sections.
            shrink-0 prevents compression in pill state; whitespace-nowrap avoids wrapping. */}
        <motion.div
          className="hidden md:flex items-center gap-6 text-sm font-normal shrink-0 whitespace-nowrap"
          animate={{ color: isScrolled ? "rgba(255,255,255,0.85)" : "rgba(26,26,26,0.65)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <a
            href="#how-it-works"
            className="py-1 hover:font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => handleNavClick(e, "how-it-works")}
          >
            How it Works
          </a>
          <a
            href="#features"
            className="py-1 hover:font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => handleNavClick(e, "features")}
          >
            Features
          </a>
        </motion.div>

        {/* Right section — flex-1 mirrors the left section width.
            justify-end pushes CTA/hamburger to the trailing edge. min-w-0 for overflow. */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-3">
          {/* Waitlist CTA — navigates to the signup/waitlist page with Ante color styling */}
          <Link
            href="/signup"
            className={`text-xs px-5 py-2.5 rounded-full font-semibold transition-colors duration-200 whitespace-nowrap shrink-0 ${
              isScrolled
                ? "bg-white hover:bg-white/90 text-[#4A8B9F]"
                : "bg-[#4A8B9F] hover:bg-[#3d7485] text-white shadow-sm"
            }`}
          >
            Join Waitlist
          </Link>

          {/* Mobile hamburger button */}
          <button
            className="md:hidden relative w-8 h-8 flex items-center justify-center"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            <span className="sr-only">
              {isMobileMenuOpen ? "Close" : "Menu"}
            </span>
            {/* Animated hamburger lines — color adapts to scroll state */}
            <span
              className="absolute block h-0.5 w-5 transition-all duration-300"
              style={{
                backgroundColor: isScrolled ? "#ffffff" : "#4A8B9F",
                transform: isMobileMenuOpen
                  ? "rotate(45deg)"
                  : "translateY(-5px)",
              }}
            />
            <span
              className="absolute block h-0.5 w-5 transition-all duration-300"
              style={{
                backgroundColor: isScrolled ? "#ffffff" : "#4A8B9F",
                opacity: isMobileMenuOpen ? 0 : 1,
              }}
            />
            <span
              className="absolute block h-0.5 w-5 transition-all duration-300"
              style={{
                backgroundColor: isScrolled ? "#ffffff" : "#4A8B9F",
                transform: isMobileMenuOpen
                  ? "rotate(-45deg)"
                  : "translateY(5px)",
              }}
            />
          </button>
        </div>
      </motion.div>

      {/* Mobile dropdown menu — AnimatePresence for open/close */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden absolute top-full left-4 right-4 mt-2 rounded-2xl bg-[#4A8B9F]/95 backdrop-blur-md border border-white/15 overflow-hidden pointer-events-auto shadow-lg"
          >
            <div className="flex flex-col py-3 px-6">
              <a
                href="#how-it-works"
                className="py-3 text-sm font-medium text-white/80 hover:text-white transition-colors"
                onClick={(e) => handleNavClick(e, "how-it-works")}
              >
                How it Works
              </a>
              <a
                href="#features"
                className="py-3 text-sm font-medium text-white/80 hover:text-white transition-colors"
                onClick={(e) => handleNavClick(e, "features")}
              >
                Features
              </a>
              {/* Waitlist CTA in mobile menu */}
              <Link
                href="/signup"
                className="mt-2 mb-1 text-center py-3 text-sm font-semibold text-[#4A8B9F] bg-white hover:bg-white/90 rounded-xl transition-colors shadow-sm"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Join Waitlist
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
