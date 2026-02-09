"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShimmerButton } from "./ui/shimmer-button";
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

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 100;
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
    const handler = () => { if (mql.matches) setIsMobileMenuOpen(false); };
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
    <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pt-4 px-4 md:px-0">
      <motion.div
        className="flex items-center gap-4 md:gap-8 backdrop-blur-xl border border-transparent w-full md:w-auto"
        animate={isScrolled ? "detached" : "attached"}
        initial="attached"
        variants={{
          attached: {
            borderRadius: 9999,
            backgroundColor: "rgba(0, 46, 57, 0.8)",
            padding: "12px 24px",
            y: 0,
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.2)",
            borderColor: "rgba(255, 255, 255, 0)",
          },
          detached: {
            borderRadius: 9999,
            backgroundColor: "rgba(0, 46, 57, 0.95)",
            padding: "10px 20px",
            y: 4,
            boxShadow: "0 8px 32px -8px rgba(0,0,0,0.3)",
            borderColor: "rgba(255, 255, 255, 0)",
          },
        }}
        transition={{
          duration: 0.25,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      >
        <div className="text-xl tracking-tighter text-white font-immersive">Ante</div>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-6 text-sm font-medium text-white/80">
          <a
            href="#how-it-works"
            className="hover:text-white transition-colors font-stretch-hover"
            onClick={(e) => handleNavClick(e, "how-it-works")}
          >
            How it Works
          </a>
          <a
            href="#features"
            className="hover:text-white transition-colors font-stretch-hover"
            onClick={(e) => handleNavClick(e, "features")}
          >
            Features
          </a>
        </div>

        <div className="ml-auto md:ml-0 flex items-center gap-3">
          <ShimmerButton
            shimmerColor="#ffffff"
            shimmerSize="0.05em"
            shimmerDuration="2s"
            background="linear-gradient(135deg, #005B70 0%, #004C5E 100%)"
            borderRadius="9999px"
            className="text-xs px-4 py-2"
            href="/signup"
          >
            Early Access
          </ShimmerButton>

          {/* Mobile hamburger button */}
          <button
            className="md:hidden relative w-8 h-8 flex items-center justify-center"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            <span className="sr-only">{isMobileMenuOpen ? "Close" : "Menu"}</span>
            {/* Animated hamburger lines */}
            <span
              className="absolute block h-[2px] w-5 bg-white transition-all duration-300"
              style={{
                transform: isMobileMenuOpen ? "rotate(45deg)" : "translateY(-5px)",
              }}
            />
            <span
              className="absolute block h-[2px] w-5 bg-white transition-all duration-300"
              style={{
                opacity: isMobileMenuOpen ? 0 : 1,
              }}
            />
            <span
              className="absolute block h-[2px] w-5 bg-white transition-all duration-300"
              style={{
                transform: isMobileMenuOpen ? "rotate(-45deg)" : "translateY(5px)",
              }}
            />
          </button>
        </div>
      </motion.div>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="md:hidden mt-2 w-full rounded-2xl bg-[#002E39]/95 backdrop-blur-xl border border-white/10 shadow-lg overflow-hidden"
          >
            <div className="flex flex-col py-3">
              <a
                href="#how-it-works"
                className="px-6 py-3 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                onClick={(e) => handleNavClick(e, "how-it-works")}
              >
                How it Works
              </a>
              <a
                href="#features"
                className="px-6 py-3 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors"
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
