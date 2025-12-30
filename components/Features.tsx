"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { Card } from "./ui/Card";
import { ShieldAlert, Zap, Heart, Trophy } from "lucide-react";
import { useMemo, useRef } from "react";

export function Features() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  const spotlightConfigs = useMemo(
    () => [
      { start: 0.0, middle: 0.2, end: 0.35 }, // Financial Forfeits
      { start: 0.35, middle: 0.5, end: 0.65 }, // Lightning Fast
      { start: 0.65, middle: 0.8, end: 0.95 }, // Social Proof
      { start: 0.95, middle: 1.1, end: 1.2 }, // Gamified Productivity
    ],
    []
  );

  const makeTransforms = (index: number) => {
    const { start, middle, end } = spotlightConfigs[index];
    const scale = useTransform(scrollYProgress, [start, middle, end], [0.97, 1.05, 0.97]);
    const opacity = useTransform(scrollYProgress, [start, middle, end], [0.45, 1, 0.45]);
    const zIndex = useTransform(scrollYProgress, [start, middle, end], [0, 5, 0]);
    return { scale, opacity, zIndex };
  };

  const financialTransforms = makeTransforms(0);
  const lightningTransforms = makeTransforms(1);
  const socialTransforms = makeTransforms(2);
  const gamifiedTransforms = makeTransforms(3);

  const financialBg = useTransform(scrollYProgress, [0.0, 0.2, 0.35], ["rgba(219,234,254,0)", "rgba(219,234,254,0.9)", "rgba(219,234,254,0)"]);
  const lightningBg = useTransform(scrollYProgress, [0.35, 0.5, 0.65], ["rgba(254,249,195,0)", "rgba(254,249,195,0.9)", "rgba(254,249,195,0)"]);
  const socialBg = useTransform(scrollYProgress, [0.65, 0.8, 0.95], ["rgba(255,228,230,0)", "rgba(255,228,230,0.9)", "rgba(255,228,230,0)"]);
  const gamifiedBg = useTransform(scrollYProgress, [0.95, 1.1, 1.2], ["rgba(254,243,199,0)", "rgba(254,243,199,0.9)", "rgba(254,243,199,0)"]);

  return (
    <section ref={sectionRef} className="relative h-[450vh] px-4 pt-24 md:pt-32 pb-24">
      <div className="sticky top-0 h-screen flex items-center">
        <div className="container mx-auto max-w-6xl relative">
          <div className="mb-16 text-center md:text-left">
            <h2 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 font-serif-custom">
              Features that <span className="text-gradient font-sans-flex font-immersive">actually work</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[280px] md:auto-rows-[320px] items-stretch rounded-3xl border border-gray-100 bg-white/70 backdrop-blur-sm p-4 md:p-6">
            <motion.div
              style={{ scale: financialTransforms.scale, opacity: financialTransforms.opacity, zIndex: financialTransforms.zIndex, transformOrigin: "center center" }}
              className="md:col-span-2 md:row-span-2 h-full w-full will-change-transform"
            >
              <Card
                disableViewportAnimation
                className="h-full flex flex-col justify-end p-10 bg-white border-blue-100"
              >
                <motion.div style={{ background: financialBg }} className="absolute inset-0 rounded-3xl" />
                <div className="absolute top-10 right-10 p-4 bg-blue-100 rounded-full animate-pulse">
                  <ShieldAlert className="w-12 h-12 text-blue-600" />
                </div>
                <h3 className="text-3xl font-bold mb-4 text-gray-900 font-immersive">Financial Forfeits</h3>
                <p className="text-xl text-gray-500 max-w-md font-immersive">
                  Nothing motivates like the fear of losing money. Set your price, and if you fail verification twice, you pay up.
                </p>
              </Card>
            </motion.div>

            <motion.div
              style={{ scale: lightningTransforms.scale, opacity: lightningTransforms.opacity, zIndex: lightningTransforms.zIndex, transformOrigin: "center center" }}
              className="flex flex-col h-full w-full will-change-transform"
            >
              <Card disableViewportAnimation className="h-full flex flex-col justify-between p-8 hover:border-blue-200 border border-transparent transition-colors bg-white">
                <motion.div style={{ background: lightningBg }} className="absolute inset-0 rounded-3xl" />
                <Zap className="w-10 h-10 text-yellow-500" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900 font-immersive">Lightning Fast</h3>
                  <p className="text-gray-500 text-sm font-immersive">Snap, send, verified. No friction.</p>
                </div>
              </Card>
            </motion.div>

            <motion.div
              style={{ scale: socialTransforms.scale, opacity: socialTransforms.opacity, zIndex: socialTransforms.zIndex, transformOrigin: "center center" }}
              className="flex flex-col h-full w-full will-change-transform"
            >
              <Card disableViewportAnimation className="h-full flex flex-col justify-between p-8 hover:border-blue-200 border border-transparent transition-colors bg-white">
                <motion.div style={{ background: socialBg }} className="absolute inset-0 rounded-3xl" />
                <Heart className="w-10 h-10 text-pink-500" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900 font-immersive">Social Proof</h3>
                  <p className="text-gray-500 text-sm font-immersive">Your friends keep you honest. And humble.</p>
                </div>
              </Card>
            </motion.div>

            <motion.div
              style={{ scale: gamifiedTransforms.scale, opacity: gamifiedTransforms.opacity, zIndex: gamifiedTransforms.zIndex, transformOrigin: "center center" }}
              className="md:col-span-3 flex flex-col h-full w-full will-change-transform"
            >
              <Card
                disableViewportAnimation
                className="h-full flex flex-row items-center justify-between p-10 bg-white border-blue-100"
              >
                <motion.div style={{ background: gamifiedBg }} className="absolute inset-0 rounded-3xl" />
                <div className="max-w-xl">
                  <h3 className="text-3xl font-bold mb-4 text-gray-900 font-immersive">Gamified Productivity</h3>
                  <p className="text-xl text-gray-500 font-immersive">
                    Earn streaks, unlock badges, and compete with friends. Who is the most reliable?
                  </p>
                </div>
                <div className="hidden md:block">
                  <Trophy className="w-32 h-32 text-yellow-500 rotate-12" />
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
