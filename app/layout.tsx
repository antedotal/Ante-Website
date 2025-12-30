import type { Metadata } from "next";
import { Roboto_Flex, Young_Serif } from "next/font/google";
import "./globals.css";

const robotoFlex = Roboto_Flex({
  variable: "--font-roboto-flex",
  subsets: ["latin"],
  axes: ["GRAD", "XTRA", "YOPQ", "YTLC", "YTUC", "opsz", "wdth"],
  display: "swap",
  fallback: ["Inter", "system-ui", "-apple-system", "sans-serif"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ante - The Social Task Manager",
  description: "You know you won't complete your tasks, but your friends don't. (Until now)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${robotoFlex.variable} ${youngSerif.variable} antialiased bg-gray-100 text-gray-900 font-sans selection:bg-blue-500 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
