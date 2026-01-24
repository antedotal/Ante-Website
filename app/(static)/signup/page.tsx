'use client';

// Brand Kit Configuration - Easy to customize branding elements
const BRAND_CONFIG = {
  BRAND_NAME: 'Ante',
  PRIMARY_COLOR: '#005b70', // Accent color for buttons and highlights
  COPY_HEADLINE: ["Level up your game.", "Stay accountable.", "Get things done."],
  COPY_SUBTEXT: 'Join the waitlist to be among the first to try Ante. We\'ll email you when we enter Early Access—no spam, just an invite (and perhaps a surprise!).',
  USE_TYPING_EFFECT: true, // Set to false to disable typing effect on headline
} as const;

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import TextType from '@/components/ui/TextType';
import Link from 'next/link';
import { addToWaitlist } from '@/lib/waitlist';

/**
 * High-conversion waitlist/coming soon page with:
 * - Light, cream-colored card design with soft shadows
 * - Sophisticated typography (serif headings, sans-serif body)
 * - Brand kit configuration for easy customization
 * - Subtle Framer Motion animations
 * - Optional typing effect on headline
 * - Email input with icon
 * - Full-width dark CTA button
 * - Footer with Terms | Privacy links
 */
export default function SignUpPage() {
  // State management for form submission
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Honeypot field for bot detection - real users won't fill this out
  const [honeypot, setHoneypot] = useState('');

  /**
   * Handles the waitlist submission when the button is clicked.
   * Validates the email, calls the addToWaitlist function, and manages loading/error/success states.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset previous states
    setError(null);
    setSuccess(false);

    // Basic client-side validation
    if (!email.trim()) {
      setError('Please enter your email address');
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
        // Success - clear email and show success message
        setEmail('');
        setHoneypot(''); // Reset honeypot field
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
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  const buttonVariants = {
    rest: { scale: 1 },
    hover: {
      scale: 1.02,
      transition: {
        duration: 0.2,
      },
    },
    tap: { scale: 0.98 },
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background is inherited from layout.tsx - keeping it as is */}
      
      {/* Centered card container */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-lg"
        >
          {/* Main card - off-white/cream with soft shadow */}
          <motion.div
            variants={itemVariants}
            className="w-full rounded-3xl bg-[#faf9f6] px-8 py-12 shadow-[0_24px_80px_rgba(0,0,0,0.25)] md:px-12 md:py-16"
          >
            {/* Back to home link */}
            {/* 
              Back to home button - 
              Provide a small, touch-friendly clickable area confined to the size of the icon on the card.
              This fixes the issue where the clickable area stretches to the right edge.
            */}
            <div className="mb-4">
              <Link
                href="/"
                className="inline-flex items-center opacity-50 hover:opacity-100 transition-opacity h-8 w-8 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Back to home"
                style={{
                  // Ensures the link only wraps the icon and margin can be adjusted via container.
                  boxSizing: "content-box",
                }}
              >
                <ArrowLeft className="h-5 w-5 mx-auto" />
              </Link>
            </div>

            {/* Logo - favicon with rounded corners, centered */}
            <motion.div
              variants={itemVariants}
              className="mb-6 flex justify-center"
            >
              <img
                src="/favicon.ico"
                alt={`${BRAND_CONFIG.BRAND_NAME} logo`}
                className="h-16 w-16 rounded-2xl object-contain"
              />
            </motion.div>


            {/* Brand name - large serif, centered */}
            <motion.h1
              variants={itemVariants}
              className="mb-8 text-center text-4xl font-serif-custom tracking-tight text-slate-900 md:text-5xl"
            >
              {BRAND_CONFIG.BRAND_NAME}
            </motion.h1>

            {/* Headline - with optional typing effect */}
            <motion.div
              variants={itemVariants}
              className="mb-6 text-center"
            >
              {BRAND_CONFIG.USE_TYPING_EFFECT ? (
                <h2 className="text-xl font-serif-custom text-slate-900 md:text-3xl lg:text-4xl">
                  <TextType
                    text={BRAND_CONFIG.COPY_HEADLINE}
                    typingSpeed={100}
                    showCursor={false}
                    cursorCharacter="|"
                    cursorBlinkDuration={0.8}
                    className="inline-block"
                  />
                </h2>
              ) : (
                <h2 className="text-2xl font-serif-custom text-slate-900 md:text-3xl lg:text-4xl">
                  {BRAND_CONFIG.COPY_HEADLINE}
                </h2>
              )}
            </motion.div>

            {/* Sub-headline - lighter grey, sans-serif */}
            <motion.p
              variants={itemVariants}
              className="mb-10 text-center text-base leading-relaxed text-slate-600 md:text-lg"
            >
              {BRAND_CONFIG.COPY_SUBTEXT}
            </motion.p>

            <form onSubmit={handleSubmit} className="w-full">
              {/* Email input with icon */}
              <motion.div
                variants={itemVariants}
                className="mb-6"
              >
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    disabled={isLoading || success}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-12 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      '--primary-color': BRAND_CONFIG.PRIMARY_COLOR,
                    } as React.CSSProperties & { '--primary-color': string }}
                    onFocus={(e) => {
                      const color = BRAND_CONFIG.PRIMARY_COLOR;
                      e.currentTarget.style.borderColor = color;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${color}33`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  />
                </div>
                {/*
                  Honeypot field for bot detection - hidden from real users
                  Bots will automatically fill this field, allowing us to reject their submissions
                  Uses multiple hiding techniques: absolute positioning, opacity, height, tabindex
                */}
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
                  className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Success message display */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>Thanks for joining the waitlist! We&apos;ll be in touch soon.</span>
                </motion.div>
              )}

              {/* Join Waitlist button - full width, dark background */}
              <motion.div
                variants={itemVariants}
                className="mb-8"
              >
                <motion.button
                  type="submit"
                  disabled={isLoading || success}
                  variants={buttonVariants}
                  initial="rest"
                  whileHover={!isLoading && !success ? "hover" : "rest"}
                  whileTap={!isLoading && !success ? "tap" : "rest"}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: BRAND_CONFIG.PRIMARY_COLOR,
                  }}
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

            {/* Footer - Terms | Privacy Policy */}
            <motion.div
              variants={itemVariants}
              className="flex justify-center gap-4 text-xs text-slate-500"
            >
              <Link
                href="/terms"
                className="transition-colors hover:text-slate-700"
              >
                Terms
              </Link>
              <span>|</span>
              <Link
                href="/privacy"
                className="transition-colors hover:text-slate-700"
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
