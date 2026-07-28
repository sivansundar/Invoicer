"use client";

import { useEffect } from "react";
import { runMigration } from "@/lib/storage";
import { Header } from "./header";

export function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    runMigration();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
