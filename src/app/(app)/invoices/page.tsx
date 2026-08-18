"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardSkeleton } from "@/components/ui/page-skeletons";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
import { parseInvoiceTab } from "@/lib/invoice-table";
import { useInvoices } from "@/hooks/use-invoices";

/**
 * The list the "Invoices" nav item now points at.
 *
 * It used to point at /invoices/create, so a destination named after a noun
 * performed a create action and there was no way to see every invoice without
 * going via the dashboard. Creating moved to the header's primary button.
 *
 * Deliberately the same table the dashboard renders — the tabs, search, column
 * toggle and pagination are the ones people already know — without the stat
 * cards and chart, which belong to the dashboard's "how am I doing" question
 * rather than this screen's "find me an invoice".
 */
function InvoicesPageContent() {
  const { invoices, loading } = useInvoices();
  // The dashboard's "Needs you" cards link here with ?tab=overdue, ?tab=draft
  // and ?tab=sent. The table used to ignore it, so all three buttons landed on
  // the All tab and the reader had to find the row again themselves.
  const initialTab = parseInvoiceTab(useSearchParams().get("tab"));

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-6 py-6">
      <InvoiceDataTable invoices={invoices} initialTab={initialTab} />
    </div>
  );
}

export default function InvoicesPage() {
  // useSearchParams needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <InvoicesPageContent />
    </Suspense>
  );
}
