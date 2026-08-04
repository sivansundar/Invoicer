"use client";

import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import { runMigration } from "@/lib/storage";

export function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    runMigration();
  }, []);

  return (
    <BrandFilterProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </BrandFilterProvider>
  );
}
