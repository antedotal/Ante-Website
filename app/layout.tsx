import type { Metadata } from "next";
import { DM_Sans, Young_Serif } from "next/font/google";
import "./globals.css";

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,slnt,wdth,wght,GRAD,XOPQ,XTRA,YOPQ,YTDE,YTFI,YTLC,YTUC@8..144,-10,145,100..1000,31,116,531,79,-203,738,514,712&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${dmSans.variable} ${youngSerif.variable} antialiased bg-gray-100 text-gray-900 font-sans selection:bg-blue-500 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
