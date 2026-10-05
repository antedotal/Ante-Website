import dynamic from "next/dynamic";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";

// Dynamically import below-the-fold sections to code-split large client components
// (GSAP timelines, SVG graphics, horizontal scroll loops, and footer).
// This reduces the initial JavaScript bundle parsed by V8, preventing monolithic hydration
// long tasks and eliminating main-thread contention during Largest Contentful Paint (LCP).
const CopySection = dynamic(() => import("@/components/CopySection").then((m) => m.CopySection));
const HowItWorks = dynamic(() => import("@/components/HowItWorks").then((m) => m.HowItWorks));
const Features = dynamic(() => import("@/components/Features").then((m) => m.Features));
const CallToAction = dynamic(() => import("@/components/CallToAction").then((m) => m.CallToAction));
const Footer = dynamic(() => import("@/components/Footer").then((m) => m.Footer));

export default function Home() {
  return (
    <main className="min-h-screen relative">
      <Navbar />

      {/* Jomo-style inset hero panel — teal card with rounded corners inside a white frame.
          Top padding pushes the panel below the fixed navbar's initial (bar) height. */}
      <div className="px-2 sm:px-3 md:px-6 pt-17 sm:pt-19.25 pb-2 sm:pb-3 md:pb-6">
        <div className="rounded-2xl md:rounded-3xl overflow-hidden relative">
          <Hero />
        </div>
      </div>

      <CopySection />
      <HowItWorks />
      <Features />

      <CallToAction />

      <Footer />
    </main>
  );
}
