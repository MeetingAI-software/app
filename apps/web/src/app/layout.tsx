import type { Metadata } from "next";
import { Figtree, Geist, Geist_Mono, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import BackgroundShader from "@/components/BackgroundShader";
import { BRAND_NAME, SITE_URL } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// The console's type face. Averta is the designed face but is licensed and not bundled;
// Figtree is the free Google fallback the design was actually tuned against. See --sm-font.
const figtree = Figtree({
  variable: "--font-figtree",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: BRAND_NAME,
  description: "Every meeting becomes a 90-second catch-up document.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetBrainsMono.variable} ${figtree.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols is the single remaining icon-font stylesheet used across the app. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-slate-900">
        <BackgroundShader />
        {children}
      </body>
    </html>
  );
}
