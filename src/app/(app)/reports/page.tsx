"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Upload } from "lucide-react";
import { SummaryReportDialog } from "@/components/reports/summary-report-dialog";
import { ImportExport } from "@/components/invoices/import-export";
import { ReportsSkeleton } from "@/components/ui/page-skeletons";
import { ColumnChart } from "@/components/ui/column-chart";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { IconTile, Panel, SectionLabel, TickBar } from "@/components/ui/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { formatCurrency, getCurrencySymbol } from "@/lib/utils";
import {
  availableFinancialYears,
  collectedAverage,
  compactMoney,
  dominantCurrency,
  fyLabel,
  groupByCurrency,
  monthlyTotalsForCurrency,
  summarize,
} from "@/lib/reports";
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

  /**
   * The month-by-month view is scoped to ONE currency and ONE financial year
   * at a time, and both are named on screen. A single "collected by month"
   * column adding ₹, $ and S$ together would be a number that exists nowhere
   * in the book: there is no rate in these records, and inventing one to make
   * a prettier chart is exactly the fabricated headline the redesign brief
   * rules out. So the reader picks the currency; the chart and the table
   * below it are denominated in it alone.
   *
   * Both selections are null until the reader makes one, and resolve to a
   * default derived from the data — the currency carrying the most invoices,
   * and the most recent financial year present. Storing the default in state
   * instead would freeze it at first render, before the invoices arrive.
   */
  const [pickedCurrency, setPickedCurrency] = useState<Currency | null>(null);
  const [pickedYear, setPickedYear] = useState<number | null>(null);

  const currencies = useMemo(
    () => groupByCurrency(invoices).map((group) => group.currency),
    [invoices]
  );
  const years = useMemo(() => availableFinancialYears(invoices), [invoices]);

  // A currency or year that has just vanished (an import replaced the book)
  // falls back to the default rather than showing an empty year of dashes.
  const activeCurrency =
    (pickedCurrency && currencies.includes(pickedCurrency) ? pickedCurrency : null) ??
    dominantCurrency(invoices) ??
    "INR";
  const activeYear =
    (pickedYear !== null && years.some((y) => y.startYear === pickedYear) ? pickedYear : null) ??
    years[0]?.startYear ??
    null;

  const monthly = useMemo(
    () =>
      activeYear === null
        ? []
        : monthlyTotalsForCurrency(invoices, activeCurrency, activeYear),
    [invoices, activeCurrency, activeYear]
  );

  const monthlyTotals = useMemo(
    () =>
      monthly.reduce(
        (acc, row) => ({
          issued: acc.issued + row.issued,
          collected: acc.collected + row.collected,
          outstanding: acc.outstanding + row.outstanding,
          count: acc.count + row.count,
        }),
        { issued: 0, collected: 0, outstanding: 0, count: 0 }
      ),
    [monthly]
  );

  const monthlyAverage = useMemo(() => collectedAverage(monthly), [monthly]);
  const activeMonths = monthly.filter((row) => row.count > 0).length;
  const yearPct =
    monthlyTotals.issued === 0
      ? null
      : Math.round((monthlyTotals.collected / monthlyTotals.issued) * 100);

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

      {monthly.length > 0 && activeYear !== null && (
        <div className="flex flex-col gap-3.5">
          <SectionLabel>Month by month</SectionLabel>

          <Panel className="px-[22px] pt-5 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[15.5px] font-semibold tracking-[-0.012em]">
                  Collected by month, in {CURRENCY_NAME[activeCurrency]}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
                  <span className="text-[30px] leading-none font-semibold tracking-[-0.032em] tabular-nums">
                    {formatCurrency(monthlyTotals.collected, activeCurrency)}
                  </span>
                  <span className="text-[13px] text-ink-3 tabular-nums">
                    of {formatCurrency(monthlyTotals.issued, activeCurrency)} issued ·{" "}
                    {fyLabel(activeYear)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {currencies.length > 1 && (
                  <ToggleGroup
                    type="single"
                    value={activeCurrency}
                    onValueChange={(value) => {
                      if (value) setPickedCurrency(value as Currency);
                    }}
                    aria-label="Currency"
                    className="inline-flex overflow-hidden rounded-[10px] border"
                  >
                    {currencies.map((currency) => (
                      <ToggleGroupItem
                        key={currency}
                        value={currency}
                        className="h-8 px-3 text-[13px] font-medium data-[state=on]:bg-field"
                      >
                        {currency}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                {years.length > 1 && (
                  <NativeSelect
                    size="sm"
                    aria-label="Financial year"
                    value={String(activeYear)}
                    onChange={(event) => setPickedYear(Number(event.target.value))}
                    className="rounded-[10px] text-[13px]"
                  >
                    {years.map((year) => (
                      <NativeSelectOption key={year.startYear} value={String(year.startYear)}>
                        {year.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </div>
            </div>

            <div className="mt-3.5">
              <ColumnChart
                data={monthly.map((row) => ({ label: row.shortLabel, value: row.collected }))}
                name={`Collected (${activeCurrency})`}
                color="var(--green)"
                format={(value) => compactMoney(value, activeCurrency)}
                average={monthlyAverage}
                averageLabel={
                  monthlyAverage === null
                    ? undefined
                    : `avg ${compactMoney(monthlyAverage, activeCurrency)}`
                }
              />
            </div>

            <div className="mt-3 border-t pt-3.5 text-[12.5px] leading-relaxed text-ink-3">
              {activeCurrency} invoices only — amounts are never added across currencies. Each
              month holds what was <em className="not-italic text-ink-2">billed</em> that month
              and has since been paid, so a month reconciles against its own row below.
              {monthlyAverage !== null && activeMonths > 0 && (
                <> The average line is across the {activeMonths} month
                  {activeMonths === 1 ? "" : "s"} with invoices, not all twelve.</>
              )}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
                <caption className="sr-only">
                  {fyLabel(activeYear)} month by month, in {CURRENCY_NAME[activeCurrency]}
                </caption>
                <thead>
                  <tr className="border-b text-[12.5px] font-medium text-ink-3">
                    <th scope="col" className="px-5 py-3 text-left font-medium">
                      Month
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Issued
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Collected
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Outstanding
                    </th>
                    <th scope="col" className="px-5 py-3 text-left font-medium">
                      Collection rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((row) => (
                    <tr key={row.month} className="border-b last:border-b-0">
                      <th
                        scope="row"
                        className="px-5 py-3 text-left text-[13.5px] font-medium whitespace-nowrap"
                      >
                        {row.shortLabel}{" "}
                        <span className="text-ink-3 tabular-nums">{row.calendarYear}</span>
                      </th>
                      {/* An empty month is a dash, not a zero: nothing was
                          billed, which is different from billing nothing. */}
                      <td className="px-5 py-3 text-right tabular-nums">
                        {row.count === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          formatCurrency(row.issued, activeCurrency)
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {row.count === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          formatCurrency(row.collected, activeCurrency)
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {row.count === 0 || row.outstanding === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          formatCurrency(row.outstanding, activeCurrency)
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {row.collectionPct === null ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <span className="flex items-center gap-2.5">
                            <TickBar
                              pct={row.collectionPct}
                              tone={
                                row.collectionPct >= 80
                                  ? "green"
                                  : row.collectionPct >= 50
                                    ? "amber"
                                    : "red"
                              }
                              width={92}
                            />
                            <span className="text-[12.5px] text-ink-2 tabular-nums">
                              {row.collectionPct}%
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-surface-2 text-[13.5px] font-medium">
                    <th scope="row" className="px-5 py-3 text-left font-semibold whitespace-nowrap">
                      {fyLabel(activeYear)}
                    </th>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {monthlyTotals.count === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        formatCurrency(monthlyTotals.issued, activeCurrency)
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {monthlyTotals.count === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        formatCurrency(monthlyTotals.collected, activeCurrency)
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {monthlyTotals.count === 0 || monthlyTotals.outstanding === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        formatCurrency(monthlyTotals.outstanding, activeCurrency)
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12.5px] text-ink-2 tabular-nums">
                      {yearPct === null ? <span className="text-ink-3">—</span> : `${yearPct}%`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
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
