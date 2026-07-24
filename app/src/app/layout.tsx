import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Sora,
  Inter,
  Cormorant_Garamond,
  Newsreader,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Legacy fonts — kept so components still using --font-geist-sans /
// --font-sora don't lose their typeface during the screen-by-screen
// redesign migration. Will be removed once every screen consumes
// --font-friday-sans / --font-friday-display.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

// Friday brand fonts — the new design system from Claude Design.
const fridaySans = Inter({
  variable: "--font-friday-sans",
  subsets: ["latin"],
  display: "swap",
});

const fridayDisplay = Cormorant_Garamond({
  variable: "--font-friday-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const fridaySerif = Newsreader({
  variable: "--font-friday-serif",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const fridayMono = JetBrains_Mono({
  variable: "--font-friday-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Friday.com | AI-Native Project Workspace",
  description:
    "A centralized project management and AI workflow platform built exclusively for Friday.com.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} ${fridaySans.variable} ${fridayDisplay.variable} ${fridaySerif.variable} ${fridayMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
