import Link from "next/link";
import { InstagramIcon, MailIcon } from "./ui/icons";

// Static footer with brand, social links, copyright, and legal links.
export function Footer() {
  return (
    <footer
      data-cursor-color="#ffffff"
      className="bg-[#003949] text-white px-6 py-16 md:py-20 border-t border-white/5"
    >
      <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="text-3xl md:text-4xl font-serif-custom">
          Ante <span className="opacity-70">by Antedotal</span>
        </div>
        <div className="flex-1">Made in Sydney</div>

        {/* Social links without backdrop-blur */}
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
      </div>

      {/* Copyright and legal links */}
      <div className="container mx-auto max-w-6xl mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} Antedotal. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-white/70 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white/70 transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
