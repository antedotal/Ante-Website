"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

// Smooth-scroll to an anchor with fixed-navbar offset.
function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (element) {
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
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4">
      {/* Container that morphs from full-width bar to floating pill */}
      <motion.div
        className="flex items-center justify-between w-full backdrop-blur-md"
        initial={false}
        animate={isScrolled ? "pill" : "bar"}
        variants={{
          bar: {
            maxWidth: 1152, // 72rem = max-w-6xl
            borderRadius: 0,
            backgroundColor: "rgba(0, 37, 48, 0)",
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 24,
            paddingRight: 24,
            marginTop: 0,
            boxShadow: "0 0 0 0 rgba(0,0,0,0)",
            borderColor: "rgba(255,255,255,0)",
          },
          pill: {
            maxWidth: 580,
            borderRadius: 9999,
            backgroundColor: "rgba(0, 37, 48, 0.92)",
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 24,
            paddingRight: 24,
            marginTop: 12,
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.25)",
            borderColor: "rgba(255,255,255,0.05)",
          },
        }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        style={{ borderWidth: 1, borderStyle: "solid" }}
      >
        {/* Brand */}
        <div className="text-xl tracking-tighter text-white font-immersive">
          <a href="#">Ante</a>
        </div>

        {/* Desktop nav links — font-weight change on hover instead of underline */}
        <div className="hidden md:flex items-center gap-6 text-sm font-normal text-white/80">
          <a
            href="#how-it-works"
            className="py-1 hover:text-white hover:font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => handleNavClick(e, "how-it-works")}
          >
            How it Works
          </a>
          <a
            href="#features"
            className="py-1 hover:text-white hover:font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => handleNavClick(e, "features")}
          >
            Features
          </a>
        </div>

        <div className="flex items-center gap-3">
          {/* CTA button */}
          <Link
            href="/signup"
            className="text-xs px-5 py-2.5 rounded-full bg-[#00A4C6] hover:bg-[#008da8] text-white font-semibold transition-colors duration-200"
          >
            Early Access
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
            {/* Animated hamburger lines */}
            <span
              className="absolute block h-0.5 w-5 bg-white transition-all duration-300"
              style={{
                transform: isMobileMenuOpen
                  ? "rotate(45deg)"
                  : "translateY(-5px)",
              }}
            />
            <span
              className="absolute block h-0.5 w-5 bg-white transition-all duration-300"
              style={{
                opacity: isMobileMenuOpen ? 0 : 1,
              }}
            />
            <span
              className="absolute block h-0.5 w-5 bg-white transition-all duration-300"
              style={{
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
            className="md:hidden absolute top-full left-4 right-4 mt-2 rounded-2xl bg-[#002530]/95 backdrop-blur-md border border-white/5 overflow-hidden"
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
