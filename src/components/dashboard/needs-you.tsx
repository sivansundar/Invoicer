"use client";

import Link from "next/link";
import { Clock, Send, TriangleAlert, Wallet } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { effectiveStatus, oldestDaysLate, oldestDraftAgeDays } from "@/lib/dashboard";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/primitives";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";

/**
 * The dashboard now opens with the three things that need doing, each with one
 * button, instead of four numbers you cannot act on. The metrics did not go
 * away — they moved down into the Performance strip, where a figure carries
 * the baseline it is being compared against.
 *
 * Everything here is derived from data the dashboard already loads; no new
 * query, and the brand filter is applied inside the component for the same
 * reason stat-cards.tsx does it — this renders under <Shell>'s
 * BrandFilterProvider while DashboardPage does not.
 */
export function NeedsYou({ invoices: allInvoices }: { invoices: Invoice[] }) {
  const { brandId } = useBrandFilter();
  const invoices = brandId
    ? allInvoices.filter((invoice) => invoice.brandId === brandId)
    : allInvoices;

  const overdue = invoices.filter((invoice) => effectiveStatus(invoice) === "overdue");
  const drafts = invoices.filter((invoice) => invoice.status === "draft");
  const awaiting = invoices.filter((invoice) => effectiveStatus(invoice) === "sent");

  const overdueTotal = formatCurrencyGroups(groupTotalsByCurrency(overdue));
  const awaitingTotal = formatCurrencyGroups(groupTotalsByCurrency(awaiting));
  const clientCount = new Set(awaiting.map((invoice) => invoice.client.companyName)).size;
  const draftAge = oldestDraftAgeDays(invoices);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-4 max-lg:flex-col">
        <ActionCard
          icon={TriangleAlert}
          tone="red"
          title="Overdue"
          value={pad(overdue.length)}
          unit={overdue.length === 1 ? "invoice" : "invoices"}
          noteIcon={Clock}
          note={
            overdue.length === 0
              ? "Nothing is past due"
              : `Oldest is ${oldestDaysLate(overdue)} days late · ${overdueTotal}`
          }
          action={
            overdue.length > 0 ? (
              // Dark, not blue: this is the single most urgent thing on the
              // screen, and the ordinary primary should not have to compete.
              <Button asChild className="h-9 rounded-[10px] bg-ink text-canvas hover:bg-ink/90">
                <Link href="/invoices?tab=overdue">
                  {overdue.length === 1 ? "Chase it" : "Chase all"}
                </Link>
              </Button>
            ) : null
          }
        />

        <ActionCard
          icon={Send}
          tone="amber"
          title="Ready to send"
          value={pad(drafts.length)}
          unit={drafts.length === 1 ? "draft" : "drafts"}
          noteIcon={Clock}
          note={
            drafts.length === 0
              ? "No drafts waiting"
              : draftAge === 0
                ? "Drafted today"
                : `Oldest drafted ${draftAge} ${draftAge === 1 ? "day" : "days"} ago`
          }
          action={
            drafts.length > 0 ? (
              <Button asChild variant="outline" className="h-9 rounded-[10px]">
                <Link href="/invoices?tab=draft">Review &amp; send</Link>
              </Button>
            ) : null
          }
        />

        <ActionCard
          icon={Clock}
          tone="blue"
          title="Awaiting payment"
          value={pad(awaiting.length)}
          unit={awaiting.length === 1 ? "invoice" : "invoices"}
          noteIcon={Wallet}
          note={
            awaiting.length === 0
              ? "Nothing outstanding"
              : `${awaitingTotal} across ${clientCount} ${clientCount === 1 ? "client" : "clients"}`
          }
          action={
            awaiting.length > 0 ? (
              <Button asChild variant="outline" className="h-9 rounded-[10px]">
                <Link href="/invoices?tab=sent">View sent</Link>
              </Button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
