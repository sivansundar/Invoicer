"use client";

import { Header } from "./header";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
