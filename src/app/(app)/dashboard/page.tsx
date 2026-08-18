"use client";

import { DashboardSkeleton } from "@/components/ui/page-skeletons";
import { NeedsYou } from "@/components/dashboard/needs-you";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
import { SectionLabel } from "@/components/ui/primitives";
import { useInvoices } from "@/hooks/use-invoices";

/**
 * Order matters here, and it changed: the screen used to open with four
 * numbers you cannot act on. It now opens with the three things that need
 * doing, each with one button, and the numbers moved down to Performance.
 */
export default function DashboardPage() {
  const { invoices, loading } = useInvoices();

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-3.5 px-8">
        <SectionLabel>Needs you</SectionLabel>
        <NeedsYou invoices={invoices} />
      </div>

      <div className="flex flex-col gap-3.5 px-8">
        <SectionLabel action="View full report" href="/reports">
          Performance
        </SectionLabel>
        <StatCards invoices={invoices} />
      </div>

      <div className="px-8">
        <RevenueChart invoices={invoices} />
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="px-8">
          <SectionLabel action="View all invoices" href="/invoices">
            Invoices that need you
          </SectionLabel>
        </div>
        <InvoiceDataTable invoices={invoices} />
      </div>
    </div>
  );
}
