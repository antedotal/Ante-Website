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
            Ready to become <br />
            <AuroraText
                className="font-serif-custom"
                colors={["#00BCD4", "#26C6DA", "#4DD0E1", "#80DEEA"]}
                speed={1}
              >
                a better person?
              </AuroraText>
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Join the people who <strong> actually get things done. </strong>
            {" "}Or keep scrolling. 
          </p>
          <div className="flex justify-center">
            <ShimmerButton
              shimmerColor="#ffffff"
              shimmerSize="0.08em"
              shimmerDuration="2.5s"
              background="linear-gradient(135deg, #005B70 0%, #004C5E 100%)"
              borderRadius="9999px"
              className="px-8 py-4 text-lg font-bold"
              href="/signup"
            >
              Early Access
              <ArrowRight className="w-5 h-5 ml-2" />
            </ShimmerButton>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
