"use client";

import { Camera, DollarSign, Users } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { AuroraText } from "./ui/aurora-text";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: 1,
    title: "Set the Stakes",
    description: "Create a task and set your forfeit price. How much is your procrastination worth to you? $5? $50?",
    icon: DollarSign,
    iconColor: "text-green-600",
    iconBg: "bg-green-50",
    borderColor: "border-green-100",
  },
  {
    id: 2,
    title: "Prove It",
    description: "Snap a photo evidence of your completed task. No cheating—your friends are the judges.",
    icon: Camera,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    borderColor: "border-blue-100",
  },
  {
    id: 3,
    title: "The Verdict",
    description: "Your friend reviews the photo. If they reject it twice, you pay the forfeit. Simple as that.",
    icon: Users,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
    borderColor: "border-purple-100",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-4 relative">
      <div className="container mx-auto max-w-6xl">
        <BlurFade delay={0.1} duration={0.6}>
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 font-serif-custom">
              The Pinnacle of{" "}
              <AuroraText
                className="font-serif-custom"
                colors={["#3b82f6", "#8b5cf6", "#06b6d4", "#3b82f6"]}
                speed={1}
              >
                Accountability
              </AuroraText>
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              It's not just a todo list. It's a social contract with financial consequences.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-linear-to-r from-transparent via-gray-200 to-transparent -translate-y-1/2 z-0" />

          {steps.map((step, index) => (
            <BlurFade
              key={step.id}
              delay={0.2 + index * 0.15}
              duration={0.6}
              className="relative z-10"
            >
              <div className="h-full flex flex-col items-center text-center p-8 bg-white rounded-3xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-300">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-6 border",
                  step.iconBg,
                  step.borderColor
                )}>
                  <step.icon className={cn("w-8 h-8", step.iconColor)} />
                </div>
                <h3 className="text-[28px] font-bold mb-4 text-gray-900 font-serif-custom">{step.title}</h3>
                <p className="text-gray-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
