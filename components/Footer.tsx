"use client";

import Link from "next/link";
import { InstagramIcon, MailIcon } from "./ui/icons";
import CurvedLoop from "./ui/CurvedLoop";

// Static footer with brand, social links, curved marquee, copyright, and legal links.
export function Footer() {
  return (
    <footer
      data-cursor-color="#ffffff"
      className="bg-[#003949] text-white px-6 py-16 md:py-20"
    >
      <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="text-3xl md:text-4xl font-serif-custom">
          Ante <span className="opacity-70">by Antedotal</span>
        </div>

        {/* Social links + legal links */}
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="https://www.instagram.com/antedotal/"
              aria-label="Follow Ante on Instagram"
              className="group inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 sm:py-2 text-sm font-medium hover:bg-white/15 transition-colors"
            >
              <InstagramIcon className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" />
              Instagram
            </a>
            <a
              href="mailto:hello@antedotal.com"
              aria-label="Email Ante"
              className="group inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 sm:py-2 text-sm font-medium hover:bg-white/15 transition-colors"
            >
              <MailIcon className="w-4 h-4 transition-transform duration-300 group-hover:-rotate-6" />
              Email
            </a>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/40">
            <Link href="/privacy" className="hover:text-white/70 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white/70 transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </div>

      {/* Curved marquee — "Made in Sydney" arching upward.
          Horizontal CSS mask + blur creates smooth fade on left/right edges so text doesn't clip sharply. */}
      <div
        className="container mx-auto max-w-6xl mt-20 md:mt-28 opacity-20 overflow-visible"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      >
        <CurvedLoop
          marqueeText="Made in Sydney ✦ "
          speed={0.7}
          curveAmount={-200}
          direction="left"
          interactive={false}
          fontSize="2.5rem"
          fill="#ffffff"
        />
      </div>
    </footer>
  );
}
