import { Instagram, Linkedin, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="min-h-[50vh] bg-white text-gray-900 flex flex-col justify-between p-8 md:p-16 overflow-hidden relative border-t border-gray-200">
      <div className="flex flex-col md:flex-row justify-between items-start w-full z-10">
        <div className="flex flex-col">
          <div className="text-[15vw] leading-[0.8] font-bold tracking-tighter font-serif-custom">Ante</div>
          <div className="text-xl md:text-2xl font-light opacity-60 ml-2 mt-4 font-sans-flex font-immersive">by antedotal</div>
        </div>

        <div className="flex flex-col gap-5 mt-12 md:mt-0 text-lg font-medium">
          <div className="flex items-center gap-3">
            <a
              href="#"
              aria-label="Follow Ante on Twitter"
              className="p-3 rounded-full bg-gray-900/5 hover:bg-gray-900/10 transition-all backdrop-blur-xl border border-gray-900/10 font-immersive"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a
              href="#"
              aria-label="Follow Ante on Instagram"
              className="p-3 rounded-full bg-gray-900/5 hover:bg-gray-900/10 transition-all backdrop-blur-xl border border-gray-900/10 font-immersive"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="#"
              aria-label="Connect on LinkedIn"
              className="p-3 rounded-full bg-gray-900/5 hover:bg-gray-900/10 transition-all backdrop-blur-xl border border-gray-900/10 font-immersive"
            >
              <Linkedin className="w-5 h-5" />
            </a>
          </div>

          <div className="flex flex-col gap-3 text-base">
            <a href="#" className="hover:opacity-80 transition-opacity font-stretch-hover font-immersive">Terms</a>
            <a href="#" className="hover:opacity-80 transition-opacity font-stretch-hover font-immersive">Privacy</a>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-12 flex justify-between items-end w-full z-10 opacity-60 text-sm">
        <div>© {new Date().getFullYear()} Ante Inc.</div>
      </div>
    </footer>
  );
}
