"use client";

import { Shell } from "@/components/layout/shell";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
import { useInvoices } from "@/hooks/use-invoices";

export default function DashboardPage() {
  const { invoices } = useInvoices();

  return (
    <Shell>
      <div className="flex flex-col gap-6 py-6">
        <StatCards invoices={invoices} />
        <div className="px-6">
          <RevenueChart invoices={invoices} />
        </div>
        <InvoiceDataTable invoices={invoices} />
      </div>
    </Shell>
  );
}
