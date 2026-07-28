"use client";

import { Shell } from "@/components/layout/shell";
import { SummaryReportDialog } from "@/components/reports/summary-report-dialog";
import { ImportExport } from "@/components/invoices/import-export";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";

export default function ReportsPage() {
  return (
    <Shell>
      <ReportsPageContent />
    </Shell>
  );
}

function ReportsPageContent() {
  const { brands } = useBrands();
  const { invoices } = useInvoices();

  return (
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Financial-year summaries, and a way to move your data in and out.
        </p>
      </div>

      <div className="border rounded-[14px] bg-card shadow-sm p-6">
        <h2 className="text-sm font-semibold">Financial year summary</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Every invoice in a financial year, grouped by currency, exportable as a PDF.
        </p>
        <div className="mt-4">
          <SummaryReportDialog invoices={invoices} brands={brands} />
        </div>
      </div>

      <div className="border rounded-[14px] bg-card shadow-sm p-6">
        <h2 className="text-sm font-semibold">Import and export</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Take your invoices, brands and clients with you — or bring them back.
        </p>
        <div className="mt-4 flex gap-2">
          <ImportExport onImportDone={() => {}} />
        </div>
      </div>
    </div>
  );
}
