"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface ColumnPoint {
  /** Axis label, e.g. "Sep". */
  label: string;
  value: number;
}

interface ColumnChartProps {
  data: ColumnPoint[];
  /** Series name, shown in the tooltip. The card title names it otherwise. */
  name: string;
  /** A CSS colour — pass a token, e.g. "var(--green)". */
  color?: string;
  /** Formats the tooltip value and the Y axis ticks. */
  format: (value: number) => string;
  /** Draws a labelled reference line at this value. Omit for none. */
  average?: number | null;
  averageLabel?: string;
  height?: number;
}

/**
 * Monthly totals are discrete, so they are columns. The screen this replaces
 * used an area chart, which draws a continuous slope between two months and
 * implies a value at every point in between that does not exist.
 *
 * Deliberate chrome choices, all from docs/redesign/01-design-system.md:
 * gridlines are SOLID hairlines (the old chart dashed them, which adds noise
 * at no information gain); there is no legend, because one series needs none
 * and the card title already names it; and no column carries a printed value —
 * the tooltip does that on demand.
 */
export function ColumnChart({
  data,
  name,
  color = "var(--green)",
  format,
  average = null,
  averageLabel,
  height = 236,
}: ColumnChartProps) {
  const config = { value: { label: name, color } } satisfies ChartConfig;

  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line-2)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fill: "var(--ink-3)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tick={{ fill: "var(--ink-3)", fontSize: 12 }}
          tickFormatter={format}
        />
        {average != null && (
          <ReferenceLine
            y={average}
            stroke="var(--ink-3)"
            strokeWidth={1}
            label={
              averageLabel
                ? {
                    value: averageLabel,
                    position: "insideTopLeft",
                    fill: "var(--ink-3)",
                    fontSize: 11,
                    // The line sits above the data on the left of every series
                    // we plot, so the label goes there rather than colliding
                    // with the tallest, most recent column on the right.
                    offset: 8,
                  }
                : undefined
            }
          />
        )}
        <ChartTooltip
          cursor={{ fill: "var(--ink)", fillOpacity: 0.04 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value) => format(Number(value))}
            />
          }
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ChartContainer>
  );
}
