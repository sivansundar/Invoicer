"use client";

import { DashboardSkeleton } from "@/components/ui/page-skeletons";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
import { useInvoices } from "@/hooks/use-invoices";

export default function DashboardPage() {
  const { invoices, loading } = useInvoices();

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <StatCards invoices={invoices} />
      </div>
      <div className="px-6">
        <RevenueChart invoices={invoices} />
      </div>
      <InvoiceDataTable invoices={invoices} />
    </div>
  );
}
