"use client";

import { useMemo, useState } from "react";
import { DashboardSkeleton } from "@/components/ui/page-skeletons";
import { NeedsYou } from "@/components/dashboard/needs-you";
import { ScopeRow } from "@/components/dashboard/scope-row";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InvoiceDataTable } from "@/components/dashboard/invoice-data-table";
import { SectionLabel } from "@/components/ui/primitives";
import {
  dashboardScopeControls,
  invoicesInFinancialYear,
  resolveYearScope,
  type YearScope,
} from "@/lib/dashboard-scope";
import { fyLabel } from "@/lib/reports";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";

/**
 * Order matters here, and it changed: the screen used to open with four
 * numbers you cannot act on. It now opens with the three things that need
 * doing, each with one button, and the numbers moved down to Performance.
 *
 * Above all of it sits the scope row. The financial year it picks is applied
 * here, by narrowing the invoices every section below is handed — none of
 * them knows about years. Brand is not applied here on purpose: each section
 * already reads the shared brand filter itself (see stat-cards.tsx), and the
 * row drives that same filter rather than a second copy of it.
 */
export default function DashboardPage() {
  const { invoices, loading } = useInvoices();
  // Waited on as well as the invoices: the brand segments would otherwise
  // appear a frame after the row itself and shift everything under them.
  const { brands, loading: brandsLoading } = useBrands();

  // Null until the reader picks, then resolved against the years actually on
  // the books — storing the default instead would freeze it at first render,
  // before the invoices arrive.
  const [pickedYear, setPickedYear] = useState<YearScope | null>(null);

  const activeYear = useMemo(
    () => resolveYearScope(pickedYear, dashboardScopeControls(invoices, brands)),
    [pickedYear, invoices, brands]
  );
  const scoped = useMemo(
    () => invoicesInFinancialYear(invoices, activeYear),
    [invoices, activeYear]
  );

  // Only the revenue chart is told which scope it was handed. Every other
  // section buckets by the same axis the scope narrows on, so the row above
  // speaks for them; the chart buckets by payment date over its own trailing
  // range, and two unnamed time windows on one card read as one.
  const scopeLabel = activeYear === null ? "All years" : fyLabel(activeYear);

  if (loading || brandsLoading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-6 py-6">
      <ScopeRow
        invoices={invoices}
        brands={brands}
        year={pickedYear}
        onYearChange={setPickedYear}
      />

      <div className="flex flex-col gap-3.5 px-8">
        <SectionLabel>Needs you</SectionLabel>
        <NeedsYou invoices={scoped} />
      </div>

      <div className="flex flex-col gap-3.5 px-8">
        <SectionLabel action="View full report" href="/reports">
          Performance
        </SectionLabel>
        <StatCards invoices={scoped} />
      </div>

      <div className="px-8">
        <RevenueChart invoices={scoped} scopeLabel={scopeLabel} />
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="px-8">
          <SectionLabel action="View all invoices" href="/invoices">
            Invoices that need you
          </SectionLabel>
        </div>
        <InvoiceDataTable invoices={scoped} />
      </div>
    </div>
  );
}
