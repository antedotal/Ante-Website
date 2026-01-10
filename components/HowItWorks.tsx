"use client";

import { Camera, DollarSign, Users } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { AuroraText } from "./ui/aurora-text";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: 1,
    title: "Set Your Ante",
    description: "Create a task and set your Ante. How much are your goals worth to you?",
    icon: DollarSign,
    iconColor: "text-green-600",
    iconBg: "bg-green-50",
    borderColor: "border-green-100",
  },
  {
    id: 2,
    title: "Prove It",
    description: "Snap a photo evidence of your completed task. You can't cheat—your friends are the jury.",
    icon: Camera,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    borderColor: "border-blue-100",
  },
  {
    id: 3,
    title: "The Verdict",
    description: "Your friend reviews the photo. If they reject it twice, you pay the Ante. Simple as that.",
    icon: Users,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
    borderColor: "border-purple-100",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-4 relative">
      <div className="container mx-auto max-w-6xl">
        <BlurFade delay={0.1} duration={0.6}>
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl mb-6 text-white font-serif-custom">
              The Pinnacle of{" "}
              <AuroraText
                className="font-serif-custom"
                colors={["#00BCD4", "#26C6DA", "#4DD0E1", "#80DEEA"]}
                speed={1}
              >
                Accountability
              </AuroraText>
            </h2>
            <p className="text-xl text-white/80 max-w-3xl mx-auto">
              It's not just a todo list. <br></br> It's a social contract with financial consequences.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting Line (Desktop) */}

          {steps.map((step, index) => (
            <BlurFade
              key={step.id}
              delay={0.2 + index * 0.15}
              duration={0.6}
              className="relative z-10"
            >
              <div className="h-full flex flex-col items-center text-center p-8 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 hover:border-white/20 hover:bg-white/10 hover:shadow-lg transition-all duration-300">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-6 border",
                  step.iconBg,
                  step.borderColor
                )}>
                  <step.icon className={cn("w-8 h-8", step.iconColor)} />
                </div>
                <h3 className="text-[28px] mb-4 text-white font-serif-custom">{step.title}</h3>
                <p className="text-white/70 leading-relaxed">
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
