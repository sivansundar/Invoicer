"use client";

import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrands } from "@/hooks/use-brands";
import { ImportExport } from "@/components/invoices/import-export";
import { SummaryReportDialog } from "@/components/reports/summary-report-dialog";
import { FileText, Plus } from "lucide-react";

export default function DashboardPage() {
  const { invoices, loading: invLoading, refresh } = useInvoices();
  const { brands, loading: brandLoading } = useBrands();

  const loading = invLoading || brandLoading;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8 px-6 pt-6">
        <div>
          <h1 className="text-lg font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Overview of your invoicing activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExport onImportDone={refresh} />
          <SummaryReportDialog invoices={invoices} brands={brands} />
          <Link href="/invoices/create">
            <Button size="sm" className="text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="mb-8">
            <StatCards invoices={invoices} />
          </div>

          <div className="mb-8 px-6">
            <RevenueChart invoices={invoices} />
          </div>

          {/* Invoice History */}
          <div className="space-y-4 px-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Invoice History</h2>
            </div>
            <InvoiceTable invoices={invoices} brands={brands} />
          </div>
        </>
      )}
    </Shell>
  );
}
