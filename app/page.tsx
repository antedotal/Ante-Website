import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CallToAction } from "@/components/CallToAction";

export default function Home() {
  return (
    <main className="min-h-screen text-white relative">
      <Navbar />
      <Hero />

      {/* Smooth blurred transition from hero teal to light content sections */}
      <div className="relative h-40 sm:h-52 md:h-64 -mt-16 pointer-events-none" aria-hidden="true">
        {/* Wide soft gradient underneath */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#003949] via-[#003949]/60 to-[#FAFBFC]" />
        {/* Blurred overlay for softness */}
        <div className="absolute inset-x-0 top-0 bottom-0 backdrop-blur-3xl" />
      </div>

      <HowItWorks />
      <Features />

      <CallToAction />

      <Footer />
    </main>
  );
}
