"use client";

import { ShieldAlert, Zap, Heart, Trophy } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { AuroraText } from "./ui/aurora-text";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Financial Forfeits",
    description: "Nothing motivates like the fear of losing money. Set your price, and if you fail verification twice, you pay up.",
    icon: ShieldAlert,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
    className: "md:col-span-2 md:row-span-2",
    large: true,
  },
  {
    title: "Lightning Fast",
    description: "Snap, send, verified. No friction.",
    icon: Zap,
    iconColor: "text-yellow-500",
    iconBg: "bg-yellow-100",
    className: "",
    large: false,
  },
  {
    title: "Social Proof",
    description: "Your friends keep you honest. And humble.",
    icon: Heart,
    iconColor: "text-pink-500",
    iconBg: "bg-pink-100",
    className: "",
    large: false,
  },
  {
    title: "Gamified Productivity",
    description: "Earn streaks, unlock badges, and compete with friends. Who is the most reliable?",
    icon: Trophy,
    iconColor: "text-yellow-500",
    iconBg: "bg-yellow-100",
    className: "md:col-span-3",
    large: true,
    showIcon: true,
  },
];

export function Features() {
  return (
    <section className="relative px-4 py-24 md:py-32">
      <div className="container mx-auto max-w-6xl relative">
        <BlurFade delay={0.1} duration={0.6}>
          <div className="mb-16 text-center md:text-left">
            <h2 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 font-serif-custom">
              Features that{" "}
              <AuroraText
                className="font-serif-custom"
                colors={["#3b82f6", "#8b5cf6", "#06b6d4", "#3b82f6"]}
                speed={1}
              >
                actually work
              </AuroraText>
            </h2>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {features.map((feature, index) => (
            <BlurFade
              key={feature.title}
              delay={0.15 + index * 0.1}
              duration={0.5}
              className={feature.className}
            >
              <div
                className={cn(
                  "group relative h-full rounded-3xl border border-gray-200 bg-white p-6 md:p-8 transition-all duration-300 hover:border-gray-300 hover:shadow-lg",
                  feature.large ? "min-h-[280px] md:min-h-[320px]" : "min-h-[200px]"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "inline-flex items-center justify-center rounded-2xl p-3 mb-4",
                  feature.iconBg
                )}>
                  <feature.icon className={cn("w-6 h-6", feature.iconColor)} />
                </div>

                {/* Content */}
                <div className={cn(
                  feature.large && feature.showIcon ? "flex flex-col md:flex-row md:items-center md:justify-between" : ""
                )}>
                  <div className={feature.showIcon ? "md:max-w-xl" : ""}>
                    <h3 className={cn(
                      "text-[28px] font-bold mb-3 text-gray-900 font-subheading"
                    )}>
                      {feature.title}
                    </h3>
                    <p className={cn(
                      "text-gray-500 leading-relaxed",
                      feature.large ? "text-lg" : "text-sm"
                    )}>
                      {feature.description}
                    </p>
                  </div>
                  {feature.showIcon && (
                    <div className="hidden md:block">
                      <Trophy className="w-24 h-24 text-yellow-500 rotate-12 opacity-80" />
                    </div>
                  )}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
