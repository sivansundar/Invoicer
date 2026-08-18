"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Upload } from "lucide-react";
import { SummaryReportDialog } from "@/components/reports/summary-report-dialog";
import { ImportExport } from "@/components/invoices/import-export";
import { ReportsSkeleton } from "@/components/ui/page-skeletons";
import { IconTile, Panel, SectionLabel, TickBar } from "@/components/ui/primitives";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { formatCurrency, getCurrencySymbol } from "@/lib/utils";
import { summarize } from "@/lib/reports";
import type { Currency } from "@/lib/types";

const CURRENCY_NAME: Record<Currency, string> = {
  INR: "Indian rupee",
  USD: "US dollar",
  SGD: "Singapore dollar",
};

export default function ReportsPage() {
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { brands, loading: brandsLoading } = useBrands();
  const queryClient = useQueryClient();

  /**
   * Grouped by currency before anything else, because that is how a
   * multi-currency book is actually read — a single headline number across
   * INR, USD and SGD would be a fiction. Mirrors how `summarize` already
   * aggregates.
   */
  const perCurrency = useMemo(() => {
    const issued = invoices.filter((invoice) => invoice.status !== "draft");
    const paid = issued.filter((invoice) => invoice.status === "paid");
    const outstanding = issued.filter(
      (invoice) => invoice.status === "sent" || invoice.status === "overdue"
    );

    return summarize(issued).totalsByCurrency.map((row) => {
      const paidTotal = summarize(paid).totalsByCurrency.find(
        (c) => c.currency === row.currency
      );
      const outstandingTotal = summarize(outstanding).totalsByCurrency.find(
        (c) => c.currency === row.currency
      );
      const collected = paidTotal?.total ?? 0;
      return {
        currency: row.currency,
        issued: row.total,
        collected,
        outstanding: outstandingTotal?.total ?? 0,
        // Amount-based is safe here: within one currency card there is
        // nothing to mix.
        pct: row.total === 0 ? 0 : Math.round((collected / row.total) * 100),
      };
    });
  }, [invoices]);

  // Both queries, not just one: these render together and the summary is
  // built from brands and invoices at once, and rendering with one of them
  // still empty produces a report that is silently missing rows.
  if (brandsLoading || invoicesLoading) return <ReportsSkeleton />;

  return (
    <div className="flex max-w-[1100px] flex-col gap-6 p-8">
      <p className="max-w-[560px] text-[14.5px] text-ink-2">
        Financial-year summaries, and a way to move your data in and out.
      </p>

      {perCurrency.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <SectionLabel>Collected by currency</SectionLabel>
          <div className="flex gap-4 max-lg:flex-col">
            {perCurrency.map((row) => (
              <Panel key={row.currency} className="min-w-0 flex-1 px-5 py-[18px]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-[34px] items-center justify-center rounded-[9px] bg-field text-[15px] font-semibold">
                    {getCurrencySymbol(row.currency)}
                  </span>
                  <span className="text-[14.5px] font-semibold tracking-[-0.012em]">
                    {CURRENCY_NAME[row.currency]}
                  </span>
                </div>
                <div className="mt-3.5 text-[30px] leading-none font-semibold tracking-[-0.032em] tabular-nums">
                  {formatCurrency(row.collected, row.currency)}
                </div>
                <div className="mt-1.5 text-[13px] text-ink-2">
                  collected of {formatCurrency(row.issued, row.currency)} issued
                </div>
                <div className="mt-3.5 flex items-center gap-3">
                  <TickBar
                    pct={row.pct}
                    tone={row.pct >= 80 ? "green" : row.pct >= 50 ? "amber" : "red"}
                    width={120}
                  />
                  <span className="text-[12.5px] text-ink-2 tabular-nums">{row.pct}%</span>
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t pt-3">
                  <span className="text-[13px] text-ink-2">Outstanding</span>
                  <span className="text-[14.5px] font-medium tabular-nums">
                    {row.outstanding === 0 ? "—" : formatCurrency(row.outstanding, row.currency)}
                  </span>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        <SectionLabel>Financial year summary</SectionLabel>
        <Panel className="flex flex-wrap items-center gap-4 p-5">
          <IconTile icon={FileText} tone="violet" />
          <div className="min-w-[240px] flex-1">
            <div className="text-[14.5px] font-medium">Every invoice in a financial year</div>
            <div className="mt-1 text-[13px] text-ink-2">
              Grouped by currency, exportable as a PDF for your accountant.
            </div>
          </div>
          <SummaryReportDialog invoices={invoices} brands={brands} />
        </Panel>
      </div>

      {/*
        Given its own section rather than a small heading at the bottom of the
        page. This is where the only route out of the account lives, and it
        was easy to miss when it read as a footnote.
      */}
      <div className="flex flex-col gap-3.5">
        <SectionLabel>Import and export</SectionLabel>
        <Panel className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <IconTile icon={Download} tone="blue" />
            <div className="min-w-[240px] flex-1">
              <div className="text-[14.5px] font-medium">Back up everything, or bring it back</div>
              <div className="mt-1 text-[13px] text-ink-2">
                Brands, clients, templates and invoices as one JSON file. An import previews
                what it will change before anything is written.
              </div>
            </div>
            {/* `ImportExport` writes through `writeImport` directly, bypassing
                the `useBrands`/`useInvoices`/`useClients`/`useTemplates`
                mutation layer that owns cache invalidation — same gap as the
                one-time local-data prompt. Without this, a screen already
                holding a cached (possibly stale-empty) list keeps showing it
                after "Import Complete" is dismissed, for up to `staleTime`. */}
            <ImportExport onImportDone={() => queryClient.invalidateQueries()} />
          </div>
          <div className="mt-4 flex items-start gap-2.5 border-t pt-3.5">
            <Upload className="mt-px size-4 shrink-0 text-ink-3" />
            <span className="text-[12.5px] leading-relaxed text-ink-2">
              Nothing here is locked in: the export is the same shape the importer reads, so a
              backup taken today restores into a fresh account.
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
