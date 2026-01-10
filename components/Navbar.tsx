"use client";

import { motion } from "framer-motion";
import { ShimmerButton } from "./ui/shimmer-button";
import { useState, useEffect } from "react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4">
      <motion.div
        className="flex items-center gap-8 backdrop-blur-xl border border-transparent"
        animate={isScrolled ? "detached" : "attached"}
        initial="attached"
        variants={{
          attached: {
            width: "auto",
            borderRadius: 9999,
            backgroundColor: "rgba(0, 46, 57, 0.8)",
            padding: "12px 24px",
            y: 0,
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.2)",
            borderColor: "rgba(255, 255, 255, 0.1)",
          },
          detached: {
            width: "auto",
            borderRadius: 9999,
            backgroundColor: "rgba(0, 46, 57, 0.95)",
            padding: "10px 20px",
            y: 4,
            boxShadow: "0 8px 32px -8px rgba(0,0,0,0.3)",
            borderColor: "rgba(255, 255, 255, 0.15)",
          },
        }}
        transition={{
          duration: 0.25,
          ease: [0.25, 0.1, 0.25, 1]
        }}
      >
        <div className="text-xl tracking-tighter text-white font-immersive">Ante</div>
        <div className="hidden md:flex gap-6 text-sm font-medium text-white/80 ml-auto md:ml-0">
          <a 
            href="#how-it-works" 
            className="hover:text-white transition-colors font-stretch-hover"
            onClick={(e) => {
              e.preventDefault();
              const element = document.getElementById('how-it-works');
              if (element) {
                const offset = 100; // Account for fixed navbar height
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                window.scrollTo({
                  top: offsetPosition,
                  behavior: 'smooth'
                });
              }
            }}
          >
            How it Works
          </a>
          <a 
            href="#features" 
            className="hover:text-white transition-colors font-stretch-hover"
            onClick={(e) => {
              e.preventDefault();
              const element = document.getElementById('features');
              if (element) {
                const offset = 100; // Account for fixed navbar height
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                window.scrollTo({
                  top: offsetPosition,
                  behavior: 'smooth'
                });
              }
            }}
          >
            Features
          </a>
        </div>
        <div className="ml-auto md:ml-0">
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
        </div>
      </motion.div>
    </nav>
  );
}
