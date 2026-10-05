import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CustomCursor } from "@/components/ui/CustomCursor";
import { LenisProvider } from "@/components/ui/LenisProvider";

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

/**
 * RootLayout: Top-level layout providing HTML head setup, CDN fonts,
 * global styling, and smooth scroll orchestration.
 *
 * Performance note:
 * The previously used fixed fullscreen SVG noise overlay (feTurbulence with mixBlendMode: overlay)
 * has been removed to resolve GPU compositing bottlenecks and eliminate scroll stutter.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect links to establish early connections to Google Fonts CDN, preventing layout shifts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Load Google Sans Flex variable font via Google Fonts CDN with opsz, wdth, wght, and ROND axes (sorted alphabetically per Google Fonts API spec) */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wdth,wght,ROND@6..144,25..151,1..1000,0..100&display=swap"
        />
        {/* Material Symbols Rounded — used for the Android download icon */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=android&display=optional"
        />
      </head>
      <body
        className="antialiased text-white selection:bg-blue-500 selection:text-white relative"
        style={{
          background: '#FAFBFC',
          minHeight: '100vh'
        }}
      >
        {/* Smooth scrolling manager using Lenis synchronized with GSAP. */}
        <LenisProvider />
        {/* Custom cursor follows the pointer and adapts to section colors.
            Set enabled={true} to re-enable the animated dot + ring cursor. */}
        <CustomCursor enabled={false} />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
