import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google, and
// no layout shift. See docs/redesign/01-design-system.md for where each is used.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Display only — page titles and the login headline. It ships a single weight,
// which is why headings set no font-weight of their own.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Relative image paths in `openGraph`/`twitter` resolve against this.
  // Unset, Next.js falls back to localhost, so every share card in a
  // deployed build points at a host the crawler cannot reach.
  //
  // `NEXT_PUBLIC_SITE_URL` is set per environment; the localhost fallback is
  // only ever right for `next dev`.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Invoicer",
  description: "Invoice management",
  openGraph: {
    title: "Invoicer",
    description: "Invoice management",
    images: [{ url: "/logo.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Invoicer",
    description: "Invoice management",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
