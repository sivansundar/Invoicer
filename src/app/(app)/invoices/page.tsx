"use client";

import { DashboardSkeleton } from "@/components/ui/page-skeletons";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
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
export default function InvoicesPage() {
  const { invoices, loading } = useInvoices();

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-6 py-6">
      <InvoiceDataTable invoices={invoices} />
    </div>
  );
}
