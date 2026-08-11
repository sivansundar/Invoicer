"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const INVOICE_DETAIL_RE = /^\/invoices\/[^/]+$/;
const INVOICE_EDIT_RE = /^\/invoices\/[^/]+\/edit$/;
const BRAND_DETAILS_RE = /^\/brands\/(create|[^/]+\/edit)$/;
const CLIENT_DETAILS_RE = /^\/clients\/(create|[^/]+\/edit)$/;

export function getCrumb(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/invoices/create") return "New invoice";
  if (INVOICE_EDIT_RE.test(pathname)) return "Edit invoice";
  if (INVOICE_DETAIL_RE.test(pathname)) return "Invoice";
  if (pathname === "/brands") return "Brands";
  if (BRAND_DETAILS_RE.test(pathname)) return "Brand details";
  if (pathname === "/clients") return "Clients";
  if (CLIENT_DETAILS_RE.test(pathname)) return "New client";
  if (pathname === "/followups") return "Follow-ups";
  if (pathname.startsWith("/followups/templates/")) return "Email template";
  if (pathname === "/reports") return "Reports";
  // Unmapped route (e.g. hit directly, or a route this map hasn't caught up
  // with yet) — fall back to the app name rather than an empty heading.
  return "Invoicer";
}

export function showNewInvoiceAction(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    (INVOICE_DETAIL_RE.test(pathname) && pathname !== "/invoices/create")
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const crumb = getCrumb(pathname);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-6">
      <SidebarTrigger className="-ml-1.5" />
      <div className="mx-2 h-4 w-px bg-border" />
      <h1 className="text-base font-medium">{crumb}</h1>
      <div className="flex-1" />
      <ThemeToggle />
      {showNewInvoiceAction(pathname) && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/invoices/create">
            <Plus className="size-3.5" />
            New invoice
          </Link>
        </Button>
      )}
    </header>
  );
}
