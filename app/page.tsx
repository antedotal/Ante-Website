import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/Button";
import ColorBendBackground from "@/components/ColorBendBackground";

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
            <span className="text-gradient line-through decoration-red-500 decoration-4 font-sans-flex font-immersive">lying to yourself?</span>
          </h2>
          <p className="text-xl text-gray-500 mb-10 font-immersive">
            Join thousands of students who are finally getting things done.
            (Or paying for it).
          </p>
          <Button size="lg" className="text-lg font-bold px-8 py-4 h-auto">
            Download Ante Now
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  );
}
