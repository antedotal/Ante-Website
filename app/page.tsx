import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CallToAction } from "@/components/CallToAction";
import { CopySection } from "@/components/CopySection";

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
