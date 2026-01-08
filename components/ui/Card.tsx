"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends HTMLMotionProps<"div"> {
  gradient?: boolean;
  children?: React.ReactNode;
  spotlightOnScroll?: boolean;
  disableViewportAnimation?: boolean;
}

export function Card({ className, children, gradient = false, spotlightOnScroll = false, disableViewportAnimation = false, ...props }: CardProps) {
  const initialState = spotlightOnScroll
    ? { opacity: 0.75, scale: 0.94, y: 20 }
    : { opacity: 0, y: 20 };
  const whileInViewState = spotlightOnScroll
    ? { opacity: 1, scale: 1.06, y: 0 }
    : { opacity: 1, y: 0 };

  const motionProps = disableViewportAnimation
    ? {}
    : {
      initial: initialState,
      whileInView: whileInViewState,
      viewport: { once: false, amount: 0.6, margin: "-50px" },
      transition: { duration: 0.5, type: spotlightOnScroll ? "spring" as const : "tween" as const, stiffness: spotlightOnScroll ? 120 : undefined },
    };

  return (
    <motion.div
      {...motionProps}
      className={cn(
        "rounded-3xl p-6 relative overflow-hidden",
        "bg-white border border-gray-100",
        gradient && "bg-linear-to-br from-white to-blue-50",
        className
      )}
      {...props}
    >
      {gradient && (
        <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 via-transparent to-blue-500/5 pointer-events-none" />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
