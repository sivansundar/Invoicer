"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";

/**
 * This used to run the v1→v2 localStorage migration on mount. It no longer
 * does, for two reasons: nothing reads those keys any more, so the work was
 * pointless — and, more importantly, it rewrote the user's local data before
 * they had chosen to bring it into their account. That data is now the only
 * copy of anything they have not yet imported, and it should not be touched
 * until they ask. The importer runs `migrateToV2` on the records it is
 * given, which is where that normalisation belongs.
 */
export function Shell({ children }: { children: React.ReactNode }) {
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
