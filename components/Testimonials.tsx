"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

/**
 * Testimonials Component
 *
 * Purpose: Display social proof through animated testimonial carousel
 * Functionality:
 * - Infinite horizontal marquee scrolling effect
 * - Staggered entrance animation with wave-like timing
 * - Cards replay animation when scrolling back into view
 * - Dynamic marquee distance calculated from container scrollWidth
 *
 * Implementation:
 * - Uses continuous x-axis animation for marquee effect
 * - Static initial values to prevent hydration mismatch
 * - Staggered delays create wave-like visual effect
 * - viewport={{ once: false }} allows animation replay on scroll
 * - Duplicates testimonials array for seamless infinite scroll
 */

interface Testimonial {
  name: string;
  role: string;
  content: string;
  avatar: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Sarah Chen",
    role: "Product Manager",
    content: "Lost $50 once. Never missed a deadline again. Best investment I ever made.",
    avatar: "SC",
  },
  {
    name: "Marcus Rodriguez",
    role: "Entrepreneur",
    content: "The accountability I needed but was too cheap to pay for. Until I actually had to pay.",
    avatar: "MR",
  },
  {
    name: "Emily Watson",
    role: "Designer",
    content: "My friends keep me honest. And my wallet keeps me motivated. Perfect combo.",
    avatar: "EW",
  },
  {
    name: "David Kim",
    role: "Developer",
    content: "I used to procrastinate everything. Now I procrastinate nothing. Fear works.",
    avatar: "DK",
  },
  {
    name: "Lisa Johnson",
    role: "Fitness Coach",
    content: "Finally hit my goals because failure literally costs me. Revolutionary concept.",
    avatar: "LJ",
  },
  {
    name: "Alex Thompson",
    role: "Student",
    content: "Turned my habits around in 30 days. The stakes made it real. No going back.",
    avatar: "AT",
  },
];

// Duplicate testimonials for seamless infinite scroll
const infiniteTestimonials = [...testimonials, ...testimonials];

// Pre-calculated stagger delays for wave-like effect (avoids hydration mismatch)
const staggerDelays = [0, 0.08, 0.16, 0.24, 0.12, 0.20];

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  // Use pre-calculated delay based on position for wave effect
  const delay = staggerDelays[index % staggerDelays.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.3 }}
      transition={{
        delay: delay,
        duration: 0.5,
        ease: "easeOut",
      }}
      className="flex-shrink-0 w-[320px] md:w-[350px] mx-2 md:mx-3"
    >
      <div className="h-full p-5 md:p-6 rounded-3xl bg-white/10 backdrop-blur-sm hover:bg-white/15 transition-all duration-300">
        {/* Quote Icon */}
        <div className="mb-3 md:mb-4">
          <Quote className="w-6 h-6 md:w-8 md:h-8 text-cyan-400 opacity-50" />
        </div>

        {/* Testimonial Content */}
        <p className="text-white/90 text-base md:text-lg mb-5 md:mb-6 leading-relaxed">
          &ldquo;{testimonial.content}&rdquo;
        </p>

        {/* Author Info */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <motion.div
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm md:text-base font-bold"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: false }}
            transition={{ delay: delay + 0.2, duration: 0.4, type: "spring", stiffness: 200 }}
          >
            {testimonial.avatar}
          </motion.div>

          {/* Name and Role */}
          <div>
            <div className="text-white font-semibold text-sm md:text-base">{testimonial.name}</div>
            <div className="text-white/60 text-xs md:text-sm">{testimonial.role}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [marqueeDistance, setMarqueeDistance] = useState(2100);

  // Calculate marquee scroll distance from the actual rendered width of half the track.
  // Recalculates on resize so the marquee adapts without gaps.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setMarqueeDistance(track.scrollWidth / 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="relative px-4 py-16 sm:py-24 md:py-32 overflow-hidden">
      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Heading */}
        <motion.div
          className="text-center mb-12 md:mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl mb-4 text-white font-serif-custom">
            What People Are Saying
          </h2>
          <p className="text-base sm:text-xl text-white/80">
            Real testimonials from people who refuse to fail
          </p>
        </motion.div>

        {/* Marquee Container */}
        <div className="relative">
          {/* Gradient Fade on Edges */}
          <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-16 md:w-24 bg-gradient-to-r from-[#003A4A] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-16 md:w-24 bg-gradient-to-l from-[#003A4A] to-transparent z-10 pointer-events-none" />

          {/* Scrolling Testimonials - distance calculated dynamically */}
          <motion.div
            ref={trackRef}
            className="flex py-4"
            animate={{
              x: [0, -marqueeDistance],
            }}
            transition={{
              duration: 35,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            {infiniteTestimonials.map((testimonial, index) => (
              <TestimonialCard
                key={`${testimonial.name}-${index}`}
                testimonial={testimonial}
                index={index % testimonials.length}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
