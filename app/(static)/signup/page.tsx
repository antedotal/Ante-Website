'use client';

/**
 * Waitlist Signup Page — /signup
 *
 * Dark-themed signup page with animated Grainient background matching the Hero.
 * Collects emails for marketing onboarding via the waitlist Supabase table.
 *
 * Design system:
 * - Grainient background (#236597, #003949, #00b0df) — same as Hero
 * - Glassmorphism card (bg-white/5, backdrop-blur, border-white/10)
 * - font-serif-custom for headings, DM Sans for body
 * - Teal accent CTA (#00A4C6) — same as Navbar
 */

// Brand Kit Configuration — single source of truth for copy and accent color
const BRAND_CONFIG = {
  BRAND_NAME: 'Ante',
  PRIMARY_COLOR: '#00A4C6', // Teal accent — matches Navbar CTA
  COPY_HEADLINE: 'Be the first to try Ante.',
  COPY_SUBTEXT: 'Join the waitlist and we\'ll email you when we launch — no spam, just an invite.',
} as const;

import { useState } from 'react';
import Image from 'next/image';
import { motion, Variants } from 'framer-motion';
import { ArrowLeft, Mail, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { addToWaitlist } from '@/lib/waitlist';
import Grainient from '@/components/ui/Grainient';

/**
 * Waitlist signup page with:
 * - Full-screen animated Grainient background matching the Hero section
 * - Dark glassmorphism card with white/opacity text
 * - Email input with Supabase waitlist integration
 * - Honeypot bot detection
 * - Framer Motion staggered entrance animations
 * - Consistent typography and colors with the rest of the site
 */
export default function SignUpPage() {
  // State management for form submission
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Honeypot field for bot detection — real users won't fill this out
  const [honeypot, setHoneypot] = useState('');

  /**
   * Handles the waitlist submission when the button is clicked.
   * Validates the email, calls the addToWaitlist function, and manages loading/error/success states.
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Reset previous states
    setError(null);
    setSuccess(false);

    // Basic client-side validation
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Pass email, referralSource (null), marketingConsent (true), and honeypot for bot detection
      const { error: waitlistError } = await addToWaitlist(email, null, true, honeypot);

      if (waitlistError) {
        // Handle error from waitlist function
        setError(waitlistError.message || 'Something went wrong. Please try again.');
      } else {
        // Success — clear email and show success message
        setEmail('');
        setHoneypot('');
        setSuccess(true);
        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch {
      // Handle unexpected errors
      setError('An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants for Framer Motion
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Animated WebGL gradient background — same colors as Hero section */}
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

      {/* Centered card container */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-lg"
        >
          {/* Main card — dark glassmorphism with frosted glass effect */}
          <motion.div
            variants={itemVariants}
            className="w-full rounded-3xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] px-5 py-8 sm:px-8 sm:py-12 md:px-12 md:py-16 shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
          >
            {/* Back to home link */}
            <div className="mb-4">
              <Link
                href="/"
                className="inline-flex items-center opacity-40 hover:opacity-80 transition-opacity h-8 w-8 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A4C6]"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-5 w-5 text-white mx-auto" />
              </Link>
            </div>

            {/* Logo — favicon with rounded corners, centered */}
            <motion.div
              variants={itemVariants}
              className="mb-6 flex justify-center"
            >
              <Image
                src="/favicon.ico"
                alt={`${BRAND_CONFIG.BRAND_NAME} logo`}
                width={64}
                height={64}
                className="h-16 w-16 rounded-2xl object-contain"
              />
            </motion.div>

            {/* Brand name — large serif heading, centered */}
            <motion.h1
              variants={itemVariants}
              className="mb-6 sm:mb-8 text-center text-3xl sm:text-4xl font-serif-custom tracking-tight text-white md:text-5xl"
            >
              {BRAND_CONFIG.BRAND_NAME}
            </motion.h1>

            {/* Headline */}
            <motion.div
              variants={itemVariants}
              className="mb-4 text-center"
            >
              <h2 className="text-xl sm:text-2xl font-serif-custom text-white md:text-3xl">
                {BRAND_CONFIG.COPY_HEADLINE}
              </h2>
            </motion.div>

            {/* Sub-headline — lighter, muted text */}
            <motion.p
              variants={itemVariants}
              className="mb-10 text-center text-base leading-relaxed text-white/50 md:text-lg"
            >
              {BRAND_CONFIG.COPY_SUBTEXT}
            </motion.p>

            {/* Form wrapping email + honeypot + submit */}
            <form onSubmit={handleSubmit} noValidate>
              {/* Email input with icon — dark-themed */}
              <motion.div
                variants={itemVariants}
                className="mb-6"
              >
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isLoading || success}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-1p-ignore
                    className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.06] px-12 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-[#00A4C6]/60 focus:ring-2 focus:ring-[#00A4C6]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                {/* Honeypot field for bot detection — hidden from real users */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    opacity: 0,
                    height: 0,
                    overflow: 'hidden',
                  }}
                >
                  <label htmlFor="website">Website</label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
              </motion.div>

              {/* Error message display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-300"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Success message display */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Thanks for joining the waitlist! We&apos;ll be in touch soon.</span>
                </motion.div>
              )}

              {/* Join Waitlist button — teal accent, full width */}
              <motion.div
                variants={itemVariants}
                className="mb-8"
              >
                <motion.button
                  type="submit"
                  disabled={isLoading || success}
                  whileHover={!isLoading && !success ? { scale: 1.02 } : {}}
                  whileTap={!isLoading && !success ? { scale: 0.98 } : {}}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#00A4C6] hover:bg-[#008da8]"
                >
                  {isLoading ? (
                    <>
                      <span>Joining...</span>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </>
                  ) : success ? (
                    <>
                      <span>Joined!</span>
                      <CheckCircle2 className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Join Waitlist
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </motion.button>
              </motion.div>
            </form>

            {/* Footer — Terms | Privacy Policy */}
            <motion.div
              variants={itemVariants}
              className="flex justify-center gap-4 text-xs text-white/30"
            >
              <Link
                href="/terms"
                className="transition-colors hover:text-white/60"
              >
                Terms
              </Link>
              <span>|</span>
              <Link
                href="/privacy"
                className="transition-colors hover:text-white/60"
              >
                Privacy Policy
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
