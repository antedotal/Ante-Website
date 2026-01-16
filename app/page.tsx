import { StitchUI } from "@/components/StitchUI";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen text-white relative">
      <Navbar />
      <StitchUI />
      <Footer />
    </main>
  );
}
