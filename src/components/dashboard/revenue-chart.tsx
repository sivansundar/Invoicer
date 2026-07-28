"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import type { Invoice } from "@/lib/types";
import { monthlyPaidSeries } from "@/lib/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";

const chartConfig = {
  total: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: 12, label: "12 months" },
  { value: 6, label: "6 months" },
  { value: 3, label: "3 months" },
] as const;

type RangeMonths = 12 | 6 | 3;

interface RevenueChartProps {
  invoices: Invoice[];
}

export function RevenueChart({ invoices: allInvoices }: RevenueChartProps) {
  // Applied here, not by the caller — same reasoning as stat-cards.tsx: this
  // component renders as a descendant of <Shell>'s BrandFilterProvider, while
  // DashboardPage (the caller) does not.
  const { brandId } = useBrandFilter();
  const invoices = brandId
    ? allInvoices.filter((invoice) => invoice.brandId === brandId)
    : allInvoices;

  const [range, setRange] = useState<RangeMonths>(12);

  // SVG ids are document-global — without a per-mount scope, a second chart
  // on the page (e.g. Task 21's Reports screen) could silently resolve this
  // gradient to the wrong instance's <defs>. useId() gives each mount its
  // own id; the colon it returns is invalid in a CSS url(#…) selector, so
  // strip it the same way ChartContainer already does.
  const reactId = useId();
  const gradientId = `fillTotal-${reactId.replace(/:/g, "")}`;

  const series = useMemo(() => monthlyPaidSeries(invoices, range), [invoices, range]);
  const total = useMemo(() => series.reduce((sum, point) => sum + point.total, 0), [series]);

  return (
    <div className="border rounded-[14px] bg-card shadow-xs p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Revenue collected</h3>
          <p className="text-sm text-muted-foreground mt-1">
            ₹{Math.round(total).toLocaleString("en-IN")} collected over the last {range} months
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={String(range)}
          onValueChange={(value) => {
            if (value) setRange(Number(value) as RangeMonths);
          }}
          className="inline-flex border rounded-lg overflow-hidden"
        >
          {RANGE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={String(option.value)}
              className="h-8 px-3 text-[13px] font-medium data-[state=on]:bg-accent"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ChartContainer config={chartConfig} className="h-[250px] w-full">
        <AreaChart data={series} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area
            dataKey="total"
            type="linear"
            fill={`url(#${gradientId})`}
            stroke="var(--color-total)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
