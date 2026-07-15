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
import Script from "next/script";
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
        <Script id="pendo-install" strategy="beforeInteractive">
          {`(function(apiKey){(function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];v=['initialize','identify','updateOptions','pageLoad','track','trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');})('c5a16fdd-b26e-48f5-9f41-00ea14235590');`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
