"use client";

import { ArrowRight, Smartphone } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { AuroraText } from "./ui/aurora-text";
import { ShimmerButton } from "./ui/shimmer-button";
import { Particles } from "./ui/particles";
import { Button } from "./ui/Button";
import TextType from "./ui/TextType";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 pt-20">
      {/* Particles Background */}
      <Particles
        className="absolute inset-0 -z-10"
        quantity={80}
        staticity={30}
        ease={80}
        size={0.5}
        color="#80DEEA"
        vx={0.1}
        vy={0.1}
      />

      <div className="container mx-auto max-w-5xl relative z-10 text-center">
        <BlurFade delay={0.1} duration={0.6}>
          <h1 className="text-5xl md:text-7xl tracking-tight mb-6 leading-tight text-white font-serif-custom">
            Accountability That 
            <br />
            Actually{" "}
            <AuroraText
              className="font-serif-custom pb-2"
              colors={["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]}
              speed={1}
            >
            <TextType 
                text={["Costs To Ignore", "Works", "Keeps You Honest"]} 
                typingSpeed={130} 
                showCursor={false}
                loop={true}
                deletingSpeed={0}
                pauseDuration={2000}
              />
            </AuroraText>
          </h1>
        </BlurFade>

        <BlurFade delay={0.2} duration={0.6}>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Ante is the productivity app that 
          </p>
        </BlurFade>

        <BlurFade delay={0.3} duration={0.6}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ShimmerButton
              shimmerColor="#ffffff"
              shimmerSize="0.08em"
              shimmerDuration="2.5s"
              background="linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)"
              borderRadius="9999px"
              className="w-full sm:w-auto px-8 py-4 text-lg font-semibold"
            >
              Download Ante
              <ArrowRight className="w-4 h-4 ml-2" />
            </ShimmerButton>
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              <Smartphone className="w-4 h-4" />
              View Demo
            </Button>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
