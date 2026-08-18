"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  Download,
  FileText,
  LayoutDashboard,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportBackup } from "@/components/invoices/use-export-backup";

const INVOICE_DETAIL_RE = /^\/invoices\/[^/]+$/;
const INVOICE_EDIT_RE = /^\/invoices\/[^/]+\/edit$/;
const BRAND_DETAILS_RE = /^\/brands\/(create|[^/]+\/edit)$/;
const CLIENT_DETAILS_RE = /^\/clients\/(create|[^/]+\/edit)$/;
const FOLLOWUP_BRAND_RE = /^\/followups\/brands\/[^/]+$/;

export function getCrumb(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname === "/invoices") return "Invoices";
  if (pathname === "/invoices/create") return "New invoice";
  if (INVOICE_EDIT_RE.test(pathname)) return "Edit invoice";
  if (INVOICE_DETAIL_RE.test(pathname)) return "Invoice";
  if (pathname === "/brands") return "Brands";
  if (BRAND_DETAILS_RE.test(pathname)) return "Brand details";
  if (pathname === "/clients") return "Clients";
  if (CLIENT_DETAILS_RE.test(pathname)) return "New client";
  if (pathname === "/followups") return "Follow-ups";
  if (FOLLOWUP_BRAND_RE.test(pathname)) return "Follow-up history";
  if (pathname.startsWith("/followups/templates/")) return "Email template";
  if (pathname === "/reports") return "Reports";
  // Unmapped route (e.g. hit directly, or a route this map hasn't caught up
  // with yet) — fall back to the app name rather than an empty heading.
  return "Invoicer";
}

/**
 * The glyph beside the page title, matching the nav item the page belongs to.
 * A component rather than a function returning one, so the icon is not a
 * freshly-created component identity on every render.
 */
function PageIcon({ pathname }: { pathname: string }) {
  const className = "size-6 shrink-0";
  const strokeWidth = 1.9;
  if (pathname.startsWith("/brands"))
    return <Building2 className={className} strokeWidth={strokeWidth} />;
  if (pathname.startsWith("/clients"))
    return <Users className={className} strokeWidth={strokeWidth} />;
  if (pathname.startsWith("/followups"))
    return <Bell className={className} strokeWidth={strokeWidth} />;
  if (pathname.startsWith("/reports"))
    return <ChartNoAxesColumn className={className} strokeWidth={strokeWidth} />;
  if (pathname.startsWith("/invoices"))
    return <FileText className={className} strokeWidth={strokeWidth} />;
  return <LayoutDashboard className={className} strokeWidth={strokeWidth} />;
}

export interface HeaderAction {
  label: string;
  href: string;
}

/**
 * The primary action for a screen. Replaces `showNewInvoiceAction`: the header
 * now carries one primary button everywhere rather than a "New invoice" link
 * on two routes, so the action has to vary with the screen.
 *
 * Create and edit routes get none — the form's own submit is the primary
 * action there, and a second one in the header would compete with it.
 */
export function getHeaderAction(pathname: string): HeaderAction | null {
  if (INVOICE_EDIT_RE.test(pathname)) return null;
  if (pathname === "/invoices/create") return null;
  if (BRAND_DETAILS_RE.test(pathname)) return null;
  if (CLIENT_DETAILS_RE.test(pathname)) return null;
  if (pathname.startsWith("/followups/templates/")) return null;

  if (pathname === "/brands") return { label: "New brand", href: "/brands/create" };
  if (pathname === "/clients") return { label: "New client", href: "/clients/create" };
  if (pathname === "/followups")
    return { label: "New template", href: "/followups/templates/create" };
  if (FOLLOWUP_BRAND_RE.test(pathname)) return null;
  if (pathname === "/reports") return null;

  if (
    pathname === "/dashboard" ||
    pathname === "/invoices" ||
    INVOICE_DETAIL_RE.test(pathname)
  ) {
    return { label: "New invoice", href: "/invoices/create" };
  }
  return null;
}

/**
 * Whether the screen offers the backup export.
 *
 * Deliberately not on /reports: that screen has its own Import and export
 * card, and a second button doing the same thing two inches away reads as two
 * different exports.
 */
export function showExportAction(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/invoices";
}

export function SiteHeader() {
  const pathname = usePathname();
  const crumb = getCrumb(pathname);
  const action = getHeaderAction(pathname);
  const { exportBackup, pending: exportPending } = useExportBackup();

  return (
    <header className="flex shrink-0 items-center gap-3.5 border-b px-8 py-5">
      <PageIcon pathname={pathname} />
      <h1 className="font-display text-[30px] leading-none tracking-[-0.018em]">{crumb}</h1>
      <div className="flex-1" />

      {showExportAction(pathname) && (
        <Button
          variant="outline"
          className="h-9 gap-2 rounded-[10px]"
          disabled={exportPending}
          onClick={exportBackup}
        >
          <Download className="size-4 text-ink-2" />
          {exportPending ? "Exporting…" : "Export"}
        </Button>
      )}

      {action && (
        <Button asChild className="h-9 gap-2 rounded-[10px]">
          <Link href={action.href}>
            <Plus className="size-4" />
            {action.label}
          </Link>
        </Button>
      )}
    </header>
  );
}
