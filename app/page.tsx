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

      <HowItWorks />
      <Features />

      <CallToAction />

      <Footer />
    </main>
  );
}
