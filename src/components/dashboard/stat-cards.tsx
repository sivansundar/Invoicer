"use client";

import { CircleCheck, Clock, FileText, Wallet } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import { avgDaysToPay, collectionRate, revenueTrend } from "@/lib/dashboard";
import { DeltaChip, MetricCard } from "@/components/ui/primitives";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";

/**
 * The Performance strip.
 *
 * These used to be the first thing on the dashboard and carried the "what
 * needs doing" load badly — a number with a trend badge is not an action.
 * They now sit below the action cards, and the rule that shapes them is that
 * **a figure never appears without the baseline it is being compared
 * against**: every card renders a `vs` line, so "81%" means something.
 *
 * The brand filter is applied here rather than by the caller because this
 * renders as a descendant of <Shell>'s BrandFilterProvider and DashboardPage
 * does not.
 */
export function StatCards({ invoices: allInvoices }: { invoices: Invoice[] }) {
  const { brandId } = useBrandFilter();
  const invoices = brandId
    ? allInvoices.filter((invoice) => invoice.brandId === brandId)
    : allInvoices;

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const paidGroups = groupTotalsByCurrency(paidInvoices);
  const trend = revenueTrend(invoices);

  const collection = collectionRate(invoices);
  const avgDays = avgDaysToPay(invoices);

  const issuedThisYear = invoices.filter((invoice) => invoice.status !== "draft").length;

  return (
    <div className="flex gap-4 max-xl:grid max-xl:grid-cols-2 max-sm:grid-cols-1">
      <MetricCard
        icon={Wallet}
        label="Revenue collected"
        value={paidGroups.length === 0 ? "None" : formatCurrencyGroups(paidGroups)}
        delta={
          trend.pct > 0 ? (
            <DeltaChip direction={trend.direction === "up" ? "up" : "down"}>
              {trend.direction === "up" ? "+" : "−"}
              {trend.pct}%
            </DeltaChip>
          ) : (
            <DeltaChip direction="flat">No change</DeltaChip>
          )
        }
        vs="vs last month"
      />

      <MetricCard
        icon={CircleCheck}
        label="Collection rate"
        value={`${collection.rate}%`}
        delta={
          <DeltaChip direction={collection.rate >= 80 ? "up" : "down"}>
            {collection.paid} of {collection.issued}
          </DeltaChip>
        }
        vs="paid vs issued"
      />

      <MetricCard
        icon={Clock}
        label="Avg days to pay"
        // null means no invoice records both a bill date and a payment date;
        // an invented 0 would read as "everyone pays instantly".
        value={avgDays === null ? "—" : `${avgDays} days`}
        delta={
          avgDays === null ? undefined : (
            <DeltaChip direction={avgDays <= 30 ? "goodDown" : "badUp"}>
              {avgDays <= 30 ? "within terms" : "over terms"}
            </DeltaChip>
          )
        }
        vs={avgDays === null ? "no payment dates recorded" : "across paid invoices"}
      />

      <MetricCard
        icon={FileText}
        label="Invoices issued"
        value={String(issuedThisYear)}
        delta={<DeltaChip direction="flat">{invoices.length} total</DeltaChip>}
        vs="excludes drafts"
      />
    </div>
  );
}
