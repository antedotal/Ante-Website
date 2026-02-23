import Grainient from '@/components/ui/Grainient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <main className="min-h-screen text-white relative overflow-hidden">
      {/* Animated brand-palette background — same Grainient as signup/hero */}
      <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <Grainient
          color1="#236597"
          color2="#003949"
          color3="#00b0df"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      {/* Page content */}
      <div className="relative z-10 container mx-auto px-4 py-16 max-w-4xl">
        {/* Back to home */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 opacity-40 hover:opacity-80 transition-opacity text-sm"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
        </div>

        <h1 className="text-4xl md:text-6xl mb-4 tracking-tight text-white font-serif-custom">
          Terms and Conditions
        </h1>

        {/* Coming-soon notice */}
        <p className="mb-8 text-sm text-white/50 font-sans-flex">
          Terms will be updated when the app is released.
        </p>

        <div className="prose prose-invert max-w-none">
          <p className="text-white/80">
            ...
          </p>
        </div>
      </div>
    </main>
  );
}
