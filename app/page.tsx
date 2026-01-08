import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { AuroraText } from "@/components/ui/aurora-text";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen text-white relative">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />

      {/* CTA Section */}
      <section className="py-32 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-white/5 pointer-events-none" />
        <div className="container mx-auto max-w-3xl relative z-10">
          <h2 className="text-5xl md:text-7xl mb-8 tracking-tight text-white font-serif-custom">
            Ready to stop <br />
            <AuroraText
              className="line-through decoration-red-500 decoration-4 font-serif-custom"
              colors={["#00BCD4", "#26C6DA", "#4DD0E1", "#80DEEA"]}
              speed={1}
            >
              lying to yourself?
            </AuroraText>
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Join thousands of students who are finally getting things done.
            (Or paying for it).
          </p>
          <ShimmerButton
            shimmerColor="#ffffff"
            shimmerSize="0.08em"
            shimmerDuration="2.5s"
            background="linear-gradient(135deg, #00BCD4 0%, #26C6DA 100%)"
            borderRadius="9999px"
            className="px-8 py-4 text-lg font-bold"
          >
            Download Ante Now
            <ArrowRight className="w-5 h-5 ml-2" />
          </ShimmerButton>
        </div>
      </section>

      <Footer />
    </main>
  );
}
