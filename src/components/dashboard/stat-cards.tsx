"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { formatCurrencyGroups, groupTotalsByCurrency, overflowSummary } from "@/lib/money";
import {
  collectionRate,
  collectionRateFooter,
  oldestDaysLate,
  revenueCardCopy,
  revenueTrend,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";

interface StatCardProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  /** Omit to suppress the badge pill entirely — e.g. no trend claim to make. */
  badge?: ReactNode;
  footer: string;
  footerSub: string;
}

function StatCard({ label, value, valueClassName, badge, footer, footerSub }: StatCardProps) {
  return (
    <div className="border rounded-[14px] bg-gradient-to-t from-black/[0.05] to-card dark:from-white/[0.06] shadow-xs p-6 flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
        <span className="col-start-1 row-start-1 text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            "col-start-1 row-start-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums leading-[1.2]",
            valueClassName
          )}
        >
          {value}
        </span>
        {badge !== undefined && (
          <span className="col-start-2 row-start-1 row-span-2 justify-self-end inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{footer}</span>
        <span className="text-muted-foreground">{footerSub}</span>
      </div>
    </div>
  );
}

interface StatCardsProps {
  invoices: Invoice[];
}

export function StatCards({ invoices: allInvoices }: StatCardsProps) {
  // The active brand filter is applied here, inside the card component, rather
  // than by the caller — this component is rendered as a descendant of
  // <Shell>'s BrandFilterProvider, and the caller (DashboardPage) is not.
  const { brandId } = useBrandFilter();
  const invoices = brandId
    ? allInvoices.filter((invoice) => invoice.brandId === brandId)
    : allInvoices;

  // Card 1: Total revenue
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const paidGroups = groupTotalsByCurrency(paidInvoices);
  const hasPaidRevenue = paidGroups.length > 0;
  const revenueValue = hasPaidRevenue ? formatCurrencyGroups(paidGroups) : "None";
  const trend = revenueTrend(invoices);
  const revenueCopy = revenueCardCopy(trend, hasPaidRevenue);
  const TrendIcon = trend.direction === "up" ? TrendingUp : TrendingDown;
  const revenueOverflow = overflowSummary(paidGroups);

  // Card 2: Outstanding
  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "overdue"
  );
  const pendingGroups = groupTotalsByCurrency(pendingInvoices);
  const outstandingValue = pendingGroups.length === 0 ? "None" : formatCurrencyGroups(pendingGroups);
  const openCount = pendingInvoices.length;
  const pendingOverflow = overflowSummary(pendingGroups);

  // Card 3: Overdue
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
  const overdueGroups = groupTotalsByCurrency(overdueInvoices);
  const lateCount = overdueInvoices.length;
  const overdueValue = lateCount === 0 ? "None" : formatCurrencyGroups(overdueGroups);

  // Card 4: Collection rate
  const collection = collectionRate(invoices);
  const { rate, paid, issued } = collection;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
      <StatCard
        label="Total revenue"
        value={revenueValue}
        badge={
          revenueCopy.showTrend ? (
            <>
              <TrendIcon className="size-3" />
              {trend.pct}%
            </>
          ) : undefined
        }
        footer={revenueCopy.footer}
        footerSub={revenueOverflow || "Paid invoices, all brands"}
      />
      <StatCard
        label="Outstanding"
        value={outstandingValue}
        badge={`${openCount} open`}
        footer={openCount > 0 ? "Awaiting payment" : "All settled"}
        footerSub={
          pendingOverflow || (openCount > 0 ? "Sent and awaiting payment" : "Nothing pending")
        }
      />
      <StatCard
        label="Overdue"
        value={overdueValue}
        valueClassName={lateCount > 0 ? "text-destructive" : undefined}
        badge={lateCount > 0 ? `${lateCount} late` : "None"}
        footer={lateCount > 0 ? "Needs a gentle nudge" : "Nothing past due"}
        footerSub={
          lateCount > 0
            ? `Oldest is ${oldestDaysLate(overdueInvoices)} days late`
            : "Every invoice is on time"
        }
      />
      <StatCard
        label="Collection rate"
        value={`${rate}%`}
        badge={`${paid}/${issued}`}
        footer={collectionRateFooter(collection)}
        footerSub="Paid vs issued, all brands"
      />
    </div>
  );
}
