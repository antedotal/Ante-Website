"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef } from "react";
import { TrendingUp, Target, Zap } from "lucide-react";

/**
 * Stats Component
 * 
 * Purpose: Display animated statistics with counting numbers on scroll
 * Functionality: 
 * - Animates counters from 0 to target value when section enters viewport
 * - Uses spring physics for scale pulse effect
 * - Features morphing gradient background
 * - Staggered reveal with elastic bounce
 * 
 * Implementation:
 * - Uses Framer Motion's useMotionValue and animate for smooth counting
 * - whileInView triggers animations only when scrolled into view
 * - Spring-based transitions for natural, bouncy feel
 * - Viewport detection with 30% threshold for better UX
 * 
 * NOTE: This component is currently commented out in app/page.tsx
 * as stats tracking is not yet implemented. Uncomment when ready to use.
 */

interface StatItemProps {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  icon: React.ElementType;
  delay: number;
  iconColor: string;
  iconBg: string;
}

function StatItem({ value, label, suffix = "", prefix = "", icon: Icon, delay, iconColor, iconBg }: StatItemProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 2,
      ease: "easeOut",
    });

    return controls.stop;
  }, [count, value]);

  return (
    <motion.div
      ref={nodeRef}
      className="relative"
      initial={{ scale: 0.8, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: false, amount: 0.3 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 15,
        delay,
      }}
    >
      <div className="relative p-8 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center rounded-2xl p-3 mb-4 ${iconBg}`}>
          {/* <Icon className={`w-6 h-6 ${iconColor}`} /> */}
        </div>

        {/* Animated Counter */}
        <motion.div className="text-5xl md:text-6xl font-bold text-white mb-2 font-serif-custom">
          {prefix}
          <motion.span>{rounded}</motion.span>
          {suffix}
        </motion.div>

        {/* Label */}
        <p className="text-white/70 text-lg">{label}</p>
      </div>
    </motion.div>
  );
}

const stats = [
  {
    value: 10000,
    label: "Tasks Completed",
    suffix: "+",
    icon: Target,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
  },
  {
    value: 50000,
    label: "Total Stakes",
    prefix: "$",
    suffix: "+",
    icon: TrendingUp,
    iconColor: "text-green-600",
    iconBg: "bg-green-100",
  },
  {
    value: 95,
    label: "Success Rate",
    suffix: "%",
    icon: Zap,
    iconColor: "text-yellow-600",
    iconBg: "bg-yellow-100",
  },
];

export function Stats() {
  return (
    <section className="relative px-4 py-24 md:py-32 overflow-hidden">
      {/* Morphing Gradient Background */}
      <motion.div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, #00BCD4 0%, transparent 70%)",
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Heading */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl mb-4 text-white font-serif-custom">
            The Numbers Speak
          </h2>
          <p className="text-xl text-white/80">
            Real results from real people who refuse to fail
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <StatItem
              key={stat.label}
              value={stat.value}
              label={stat.label}
              suffix={stat.suffix}
              prefix={stat.prefix}
              icon={stat.icon}
              delay={index * 0.2}
              iconColor={stat.iconColor}
              iconBg={stat.iconBg}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
