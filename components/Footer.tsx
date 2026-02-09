import { InstagramIcon, MailIcon } from "./ui/icons";

export function Footer() {
  return (
    <footer
      data-cursor-color="#ffffff"
      className="bg-[#003949] text-white px-6 py-16 md:py-20"
    >
      {/* Compact footer with brand line and primary links. */}
      <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="text-3xl md:text-4xl font-serif-custom">
          Ante <span className="opacity-70">by Antedotal</span>
        </div>
        <div className="flex-1">Made in Sydney</div>

        {/* Social links with 44px+ touch targets on mobile */}
        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href="https://www.instagram.com/antedotal/"
            aria-label="Follow Ante on Instagram"
            className="group inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 sm:py-2 text-sm font-medium backdrop-blur-xl hover:bg-white/25 transition-all"
          >
            <InstagramIcon className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" />
            Instagram
          </a>
          <a
            href="mailto:hello@antedotal.com"
            aria-label="Email Ante"
            className="group inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 sm:py-2 text-sm font-medium backdrop-blur-xl hover:bg-white/25 transition-all"
          >
            <MailIcon className="w-4 h-4 transition-transform duration-300 group-hover:-rotate-6" />
            Email
          </a>
        </div>
      </div>
    </footer>
  );
}
