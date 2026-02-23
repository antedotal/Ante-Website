import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import { CustomCursor } from "@/components/ui/CustomCursor";
import { LenisProvider } from "@/components/ui/LenisProvider";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

// Ensure mobile browsers render at device width instead of 980px desktop fallback.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Ante",
  description: "Stop procrastinating. Start doing.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "256x256" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Material Symbols Rounded — used for the Android download icon */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=android&display=optional"
        />
      </head>
      <body
        className={`${dmSans.variable} ${bricolageGrotesque.variable} antialiased text-white font-sans selection:bg-blue-500 selection:text-white relative`}
        style={{
          background: '#FAFBFC',
          minHeight: '100vh'
        }}
      >
        {/* Smooth scrolling manager using Lenis. */}
        <LenisProvider />
        {/* Custom cursor follows the pointer and adapts to section colors.
            Set enabled={true} to re-enable the animated dot + ring cursor. */}
        <CustomCursor enabled={false} />
        {/* Noise overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            opacity: '0.10',
            mixBlendMode: 'overlay'
          }}
        />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
