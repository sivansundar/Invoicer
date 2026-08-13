"use client";

import { useQueryClient } from "@tanstack/react-query";
import { SummaryReportDialog } from "@/components/reports/summary-report-dialog";
import { ReportsSkeleton } from "@/components/ui/page-skeletons";
import { ImportExport } from "@/components/invoices/import-export";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";

export default function ReportsPage() {
  return <ReportsPageContent />;
}

function ReportsPageContent() {
  const queryClient = useQueryClient();
  const { brands, loading: brandsLoading } = useBrands();
  const { invoices, loading: invoicesLoading } = useInvoices();

  // Both, not either: the summary dialog reads brands and invoices together,
  // and rendering with one of them still empty produces a report that is
  // silently missing rows.
  if (brandsLoading || invoicesLoading) return <ReportsSkeleton />;

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
          Back up your brands, clients, templates and invoices — or bring them back.
        </p>
        <div className="mt-4 flex gap-2">
          {/* `ImportExport` writes through `writeImport` directly, bypassing
              the `useBrands`/`useInvoices`/`useClients`/`useTemplates`
              mutation layer that owns cache invalidation — same gap as the
              one-time local-data prompt. Without this, a screen already
              holding a cached (possibly stale-empty) list keeps showing it
              after "Import Complete" is dismissed, for up to `staleTime`. */}
          <ImportExport onImportDone={() => queryClient.invalidateQueries()} />
        </div>
      </div>
    </div>
  );
}
