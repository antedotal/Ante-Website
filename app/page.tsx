import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import ColorBendBackground from "@/components/ColorBendBackground";
import { AuroraText } from "@/components/ui/aurora-text";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 relative">
      <ColorBendBackground />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />

      {/* CTA Section */}
      <section className="py-32 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-blue-100/50 pointer-events-none" />
        <div className="container mx-auto max-w-3xl relative z-10">
          <h2 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight text-gray-900 font-serif-custom">
            Ready to stop <br />
            <AuroraText
              className="line-through decoration-red-500 decoration-4 font-serif-custom"
              colors={["#3b82f6", "#8b5cf6", "#06b6d4", "#3b82f6"]}
              speed={1}
            >
              lying to yourself?
            </AuroraText>
          </h2>
          <p className="text-xl text-gray-500 mb-10">
            Join thousands of students who are finally getting things done.
            (Or paying for it).
          </p>
          <ShimmerButton
            shimmerColor="#ffffff"
            shimmerSize="0.08em"
            shimmerDuration="2.5s"
            background="linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)"
            borderRadius="9999px"
            className="px-8 py-4 text-lg font-bold"
          >
            Download Ante Now
            <ArrowRight className="w-5 h-5 ml-2" />
          </ShimmerButton>
        </div>
      </section>

      {/* Progressive Blur Overlay at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none z-40">
        <div className="absolute inset-0 bg-linear-to-t from-white/80 via-white/40 to-transparent backdrop-blur-[2px]" style={{ maskImage: 'linear-gradient(to top, black 0%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)' }} />
      </div>

      <Footer />
    </main>
  );
}
