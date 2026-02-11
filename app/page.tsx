import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CallToAction } from "@/components/CallToAction";

export default function Home() {
  return (
    <main className="min-h-screen relative bg-[#FAFBFC]">
      <Navbar />

      {/* Jomo-style inset hero panel — teal card with rounded corners inside a white frame.
          Top padding pushes the panel below the fixed navbar's initial (bar) height. */}
      <div className="px-4 sm:px-5 md:px-6 pt-[77px] pb-4 sm:pb-5 md:pb-6">
        <div className="rounded-2xl md:rounded-3xl overflow-hidden relative">
          <Hero />
        </div>
      </div>

      <HowItWorks />
      <Features />

      <CallToAction />

      <Footer />
    </main>
  );
}
