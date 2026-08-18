"use client";

import { useMemo, useState } from "react";
import type { Invoice } from "@/lib/types";
import { monthlyPaidSeries } from "@/lib/chart";
import { ColumnChart } from "@/components/ui/column-chart";
import { Panel, RankedBars, type RankedBarRow, type Tone } from "@/components/ui/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { useBrands } from "@/hooks/use-brands";

const RANGE_OPTIONS = [
  { value: 12, label: "12 months" },
  { value: 6, label: "6 months" },
  { value: 3, label: "3 months" },
] as const;

type RangeMonths = 12 | 6 | 3;

/**
 * The categorical order. Fixed, and assigned by position in the ranked list
 * rather than generated — a fifth brand folds into "Other" rather than
 * inventing a hue no one can tell from the existing four.
 */
const SERIES_TONES: Tone[] = ["blue", "amber", "violet", "green"];

/** Compact INR for axis ticks — a full ₹1,20,000 on every tick is unreadable. */
function compactInr(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  if (value >= 1e3) return `₹${Math.round(value / 1e3)}k`;
  return `₹${Math.round(value)}`;
}

export function RevenueChart({ invoices: allInvoices }: { invoices: Invoice[] }) {
  const { brandId } = useBrandFilter();
  const { brands } = useBrands();
  const invoices = brandId
    ? allInvoices.filter((invoice) => invoice.brandId === brandId)
    : allInvoices;

  const [range, setRange] = useState<RangeMonths>(12);

  const series = useMemo(() => monthlyPaidSeries(invoices, range), [invoices, range]);
  const total = useMemo(() => series.reduce((sum, point) => sum + point.total, 0), [series]);
  const average = series.length === 0 ? null : total / series.length;

  const data = useMemo(
    () => series.map((point) => ({ label: point.label, value: point.total })),
    [series]
  );

  /**
   * Revenue by brand. Ranked horizontal bars replace a 100%-stacked bar that
   * sat above a list saying the same thing — one form, and bar length answers
   * "who earns most" without decoding segment widths.
   */
  const brandRows = useMemo<RankedBarRow[]>(() => {
    const paid = allInvoices.filter((invoice) => invoice.status === "paid");
    const byBrand = new Map<string, number>();
    for (const invoice of paid) {
      // Approximate cross-currency totals the same way the chart already does,
      // so the split and the trend line cannot disagree.
      byBrand.set(invoice.brandId, (byBrand.get(invoice.brandId) ?? 0) + invoice.total);
    }

    const ranked = [...byBrand.entries()]
      .map(([id, value]) => ({
        id,
        value,
        name: brands.find((brand) => brand.id === id)?.name ?? "Deleted brand",
      }))
      .sort((a, b) => b.value - a.value);

    const grandTotal = ranked.reduce((sum, row) => sum + row.value, 0);
    if (grandTotal === 0) return [];

    const head = ranked.slice(0, SERIES_TONES.length);
    const tail = ranked.slice(SERIES_TONES.length);
    const rows: RankedBarRow[] = head.map((row, index) => ({
      name: row.name,
      value: row.value,
      display: compactInr(row.value),
      pct: Math.round((row.value / grandTotal) * 100),
      tone: SERIES_TONES[index]!,
    }));

    if (tail.length > 0) {
      const otherValue = tail.reduce((sum, row) => sum + row.value, 0);
      rows.push({
        name: `${tail.length} other ${tail.length === 1 ? "brand" : "brands"}`,
        value: otherValue,
        display: compactInr(otherValue),
        pct: Math.round((otherValue / grandTotal) * 100),
        tone: "ink",
      });
    }
    return rows;
  }, [allInvoices, brands]);

  return (
    <div className="flex gap-4 max-xl:flex-col">
      {!brandId && brandRows.length > 1 && (
        <Panel className="flex shrink-0 flex-col px-[18px] pt-5 pb-3.5 xl:w-[396px]">
          <h3 className="px-1.5 text-[15.5px] font-semibold tracking-[-0.012em]">
            Revenue by brand
          </h3>
          <div className="mt-3 px-1.5 text-[32px] leading-none font-semibold tracking-[-0.032em] tabular-nums">
            {compactInr(brandRows.reduce((sum, row) => sum + row.value, 0))}
          </div>
          <div className="mt-3.5">
            <RankedBars rows={brandRows} />
          </div>
          <div className="mt-3.5 border-t pt-3.5 text-[12.5px] text-ink-3">
            Paid invoices only · approximate across currencies
          </div>
        </Panel>
      )}

      <Panel className="min-w-0 flex-1 px-[22px] pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[15.5px] font-semibold tracking-[-0.012em]">Revenue collected</h3>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-[32px] leading-none font-semibold tracking-[-0.032em] tabular-nums">
                {compactInr(total)}
              </span>
              <span className="text-[13.5px] text-ink-3 tabular-nums">
                {average === null ? "" : `${compactInr(average)} avg/month`}
              </span>
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={String(range)}
            onValueChange={(value) => {
              if (value) setRange(Number(value) as RangeMonths);
            }}
            className="inline-flex overflow-hidden rounded-[10px] border"
          >
            {RANGE_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={String(option.value)}
                className="h-8 px-3 text-[13px] font-medium data-[state=on]:bg-field"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="mt-3.5">
          <ColumnChart
            data={data}
            name="Collected"
            color="var(--green)"
            format={compactInr}
            average={average}
            averageLabel={average === null ? undefined : `avg ${compactInr(average)}`}
          />
        </div>
      </Panel>
    </div>
  );
}
