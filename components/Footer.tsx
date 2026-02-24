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

        {/* Social + legal links — all uniform plain text links, single row */}
        <div className="flex items-center gap-4 text-sm text-white/40">
          <a
            href="https://www.instagram.com/antedotal/"
            aria-label="Follow Ante on Instagram"
            className="inline-flex items-center gap-1.5 hover:text-white/70 transition-colors"
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            Instagram
          </a>
          <a
            href="mailto:hi@antedotal.com"
            aria-label="Email Ante"
            className="inline-flex items-center gap-1.5 hover:text-white/70 transition-colors"
          >
            <MailIcon className="w-3.5 h-3.5" />
            Email
          </a>
          <Link href="/privacy" className="hover:text-white/70 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white/70 transition-colors">
            Terms
          </Link>
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
          marqueeText=" Made in Sydney ✦ "
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
