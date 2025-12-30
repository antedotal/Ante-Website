"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Button } from "./ui/Button";
import { useState } from "react";

export function Navbar() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 flex justify-center transition-all duration-300"
      animate={{
        paddingTop: isScrolled ? "1.5rem" : "0rem",
        paddingLeft: isScrolled ? "1rem" : "0rem",
        paddingRight: isScrolled ? "1rem" : "0rem",
      }}
    >
      <motion.div
        className="flex items-center gap-8 transition-all duration-300 backdrop-blur-xl"
        initial={{ width: "100%", borderRadius: "0px", backgroundColor: "rgba(255, 255, 255, 0)" }}
        animate={{
          width: isScrolled ? "auto" : "100%",
          borderRadius: isScrolled ? "9999px" : "0px",
          backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.5)",
          padding: isScrolled ? "0.75rem 1.5rem" : "1.5rem 2rem",
          border: isScrolled ? "1px solid rgba(255, 255, 255, 0.2)" : "none"
        }}
      >
        <div className="font-bold text-xl tracking-tighter text-black font-sans-flex font-immersive">Ante</div>
        <div className="hidden md:flex gap-6 text-sm font-medium text-gray-600 ml-auto md:ml-0">
          <a href="#" className="hover:text-black transition-colors font-stretch-hover font-immersive">Features</a>
          <a href="#" className="hover:text-black transition-colors font-stretch-hover font-immersive">How it Works</a>
          <a href="#" className="hover:text-black transition-colors font-stretch-hover font-immersive">Pricing</a>
        </div>
        <div className="ml-auto md:ml-0">
          <Button
            size="sm"
            variant="primary"
            className="text-xs px-4 py-2 h-auto animate-pulse hover:animate-none"
          >
            Get App
          </Button>
        </div>
      </motion.div>
    </motion.nav>
  );
}
