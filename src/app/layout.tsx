import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { currentUser } from "@clerk/nextjs/server";
import { DataHydrator } from "@/components/data-hydrator";
import { db } from "@/lib/server/db";
import { loadData } from "@/lib/server/data";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();
  // Only verified addresses can pick up a brand shared by email.
  const emails = (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress);
  const data = user ? await loadData(db(), user.id, emails) : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ThemeProvider>
            {data ? <DataHydrator data={data}>{children}</DataHydrator> : children}
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
