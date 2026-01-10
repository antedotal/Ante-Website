import { Instagram, Linkedin, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="min-h-[37vh] bg-transparent text-white flex flex-col justify-between p-8 md:p-16 overflow-hidden relative border-t border-white/10">
      <div className="flex flex-col md:flex-row justify-between items-start w-full z-10">
        <div className="flex flex-col">
          <div className="text-[12vw] leading-[0.8] tracking-tighter font-serif-custom">Ante</div>
          <div className="text-xl md:text-2xl font-light opacity-60 mt-4 font-serif-custom">by Antedotal</div>
        </div>

        <div className="flex flex-col gap-5 mt-6 md:mt-0 text-lg font-medium">
          <div className="flex items-center gap-3">
            <a
              href="#"
              aria-label="Follow Ante on Twitter"
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-xl border border-white/10"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a
              href="https://www.instagram.com/antedotal/"
              aria-label="Follow Ante on Instagram"
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-xl border border-white/10"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="#"
              aria-label="Connect on LinkedIn"
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-xl border border-white/10"
            >
              <Linkedin className="w-5 h-5" />
            </a>
          </div>

          <div className="flex flex-col gap-3 text-base">
            <a href="/terms" className="hover:opacity-80 transition-opacity font-stretch-hover">Terms</a>
            <a href="/privacy" className="hover:opacity-80 transition-opacity font-stretch-hover">Privacy</a>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-12 flex justify-between items-end w-full z-10 opacity-60 text-sm">
        <div>© {new Date().getFullYear()} Antedotal</div>
      </div>
    </footer>
  );
}
