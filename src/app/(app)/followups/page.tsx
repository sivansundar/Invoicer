"use client";

// MOCK: nothing on this screen — or anywhere in the follow-ups feature —
// ever sends an email. Schedules, templates and every invoice's reminder
// history persist like any other record, and the queue's dates are real
// arithmetic, but no reminder is ever dispatched: "sent" in this codebase
// means "recorded against the invoice". No copy on this page may say or
// imply that anything was emailed, delivered, opened or read. See
// `lib/features.ts` for what turning the flag on did and did not add.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BellOff, CalendarClock, Clock, Info, Repeat, Wallet } from "lucide-react";
import { ActionCard, SectionLabel } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/page-skeletons";
import { BrandFollowupCard } from "@/components/followups/brand-followup-card";
import { TemplateList } from "@/components/followups/template-list";
import { FollowupQueue } from "@/components/followups/followup-queue";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { useTemplates } from "@/hooks/use-templates";
import { useReminderSends } from "@/hooks/use-reminder-sends";
import { buildFollowupQueue } from "@/lib/followup-queue";

import { brandFollowupSummary } from "@/lib/followup-history";
import { sentRemindersOf } from "@/lib/reminder-stages";
import { daysLate, effectiveStatus } from "@/lib/dashboard";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import { FEATURES } from "@/lib/features";
import type { Brand, Invoice } from "@/lib/types";

export default function FollowupsPage() {
  const router = useRouter();

  // FEATURES.followups is on, so this normally does nothing. It stays because
  // the flag is the switch that takes the feature away again (no email
  // provider exists behind it) — with it off, a direct or bookmarked visit
  // goes to the dashboard rather than rendering a screen the nav no longer
  // links to.
  useEffect(() => {
    if (!FEATURES.followups) router.replace("/dashboard");
  }, [router]);

  if (!FEATURES.followups) return null;

  return <FollowupsPageContent />;
}

const QUEUE_ANCHOR = "followup-queue";

/** Each brand's schedule card below is a scroll target for the cards above. */
function brandAnchor(brandId: string): string {
  return `brand-${brandId}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ChaseAction {
  href: string;
  label: string;
}

/**
 * Where to send someone who wants an un-chased overdue invoice chased again.
 *
 * The two fixes live in different places, so the button has to point at
 * whichever one actually applies rather than at a generic list:
 *
 * - **Brand-level** — the brand's reminders are switched off, or its
 *   "stop after N" cap is spent. Both controls are on that brand's schedule
 *   card further down this page, so this scrolls to it. Picks the brand
 *   holding the most un-chased invoices, since that is the one click that
 *   clears the most rows.
 * - **Invoice-level** — follow-ups were paused on the invoice itself (or its
 *   brand has since been deleted, which leaves no schedule to fix). That
 *   switch is on the invoice, so this opens the one that is furthest past
 *   due.
 *
 * Returns null when nothing is un-chased — the card then renders no button
 * rather than one that goes somewhere pointless.
 */
function chaseAction(unchased: Invoice[], brandById: Map<string, Brand>): ChaseAction | null {
  if (unchased.length === 0) return null;

  const perBrand = new Map<string, number>();
  for (const invoice of unchased) {
    if (invoice.followupsPaused) continue;
    if (!brandById.has(invoice.brandId)) continue;
    perBrand.set(invoice.brandId, (perBrand.get(invoice.brandId) ?? 0) + 1);
  }

  const worst = [...perBrand.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst) {
    const brand = brandById.get(worst[0])!;
    return { href: `#${brandAnchor(brand.id)}`, label: `${brand.name} schedule` };
  }

  const oldest = [...unchased].sort((a, b) => daysLate(b) - daysLate(a))[0];
  return { href: `/invoices/${oldest.id}`, label: `Open ${oldest.invoiceNumber}` };
}

function FollowupsPageContent() {
  const { brands, loading: brandsLoading, save: saveBrand } = useBrands();
  const { invoices, loading: invoicesLoading, save: saveInvoice } = useInvoices();
  const { templates, loading: templatesLoading } = useTemplates();
  // Real send history, so the queue names the stage the scheduler will
  // actually send rather than one inferred from a date's position.
  const { sendsByInvoice, loading: sendsLoading } = useReminderSends();

  // Every figure below counts records. Rendering it against a not-yet-loaded
  // empty list would put a confident "00" under three headings that each
  // mean something different — so wait for the data instead.
  if (brandsLoading || invoicesLoading || templatesLoading || sendsLoading) {
    return <CardGridSkeleton cards={4} />;
  }

  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const sentByInvoice = new Map(
    [...sendsByInvoice.entries()].map(([id, rows]) => [id, sentRemindersOf(rows)])
  );
  const queue = buildFollowupQueue(invoices, brands, sentByInvoice);
  const queuedIds = new Set(queue.map((entry) => entry.invoice.id));

  // Card 1 — what the schedules land on today. `buildFollowupQueue` already
  // did the cadence maths; this only reads the dates it produced.
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const dueToday = queue.filter((entry) => format(entry.scheduled, "yyyy-MM-dd") === todayKey);
  const brandsDueToday = new Set(dueToday.map((entry) => entry.brand.id)).size;

  // Card 2 — overdue with nothing scheduled against it. Being absent from the
  // queue is the honest test: it covers a paused invoice, a brand with
  // reminders switched off, and a spent "stop after N" cap alike, and it
  // cannot drift from the queue because it is derived from the same list.
  const overdue = invoices.filter((invoice) => effectiveStatus(invoice) === "overdue");
  const unchased = overdue.filter((invoice) => !queuedIds.has(invoice.id));
  const unchasedTotal = formatCurrencyGroups(groupTotalsByCurrency(unchased));
  const chase = chaseAction(unchased, brandById);

  // Card 3 — invoices paid at or after a reminder was recorded against them.
  // `brandFollowupSummary` takes any already-filtered invoice list, so the
  // whole book is a valid argument; the per-brand pass below only picks which
  // brand's history the button opens.
  const recovery = brandFollowupSummary(invoices);
  const [leadCurrency, ...otherCurrencies] = recovery.recovered;
  const historyBrand = brands
    .map((brand) => ({
      brand,
      summary: brandFollowupSummary(invoices.filter((invoice) => invoice.brandId === brand.id)),
    }))
    .filter((row) => row.summary.remindersSent > 0)
    .sort(
      (a, b) =>
        b.summary.recoveredCount - a.summary.recoveredCount ||
        b.summary.remindersSent - a.summary.remindersSent
    )[0];

  return (
    <div className="flex max-w-[1100px] flex-col gap-5 p-8">
      <p className="max-w-[560px] text-[14.5px] text-ink-2">
        Each brand chases its own unpaid invoices on the schedule you set. Reminders are recorded
        against the invoice — this app does not send the email itself.
      </p>

      <div className="flex gap-4 max-lg:flex-col">
        <ActionCard
          icon={CalendarClock}
          tone="blue"
          title="Scheduled today"
          value={pad(dueToday.length)}
          unit={dueToday.length === 1 ? "reminder" : "reminders"}
          noteIcon={dueToday.length > 0 ? Info : Clock}
          note={
            queue.length === 0
              ? "Nothing is queued right now"
              : dueToday.length === 0
                ? `Nothing today · next slot ${format(queue[0].scheduled, "EEE, d MMM")}`
                : `Across ${brandsDueToday} ${brandsDueToday === 1 ? "brand" : "brands"} · recorded here, not emailed`
          }
          action={
            queue.length > 0 ? (
              <Button asChild variant="outline" className="h-9 rounded-[10px]">
                <a href={`#${QUEUE_ANCHOR}`}>See the queue</a>
              </Button>
            ) : null
          }
        />

        <ActionCard
          icon={BellOff}
          tone="red"
          title="Not being chased"
          value={pad(unchased.length)}
          unit={unchased.length === 1 ? "invoice" : "invoices"}
          noteIcon={unchased.length > 0 ? Wallet : Clock}
          note={
            overdue.length === 0
              ? "Nothing is overdue"
              : unchased.length === 0
                ? "Every overdue invoice has a slot"
                : `${unchasedTotal} · no reminder scheduled`
          }
          action={
            chase ? (
              // Dark rather than outline: money past due with nothing at all
              // chasing it is the one thing on this screen that will not fix
              // itself.
              <Button asChild className="h-9 rounded-[10px] bg-ink text-canvas hover:bg-ink/90">
                <Link href={chase.href} className="min-w-0">
                  <span className="max-w-[150px] truncate">{chase.label}</span>
                </Link>
              </Button>
            ) : null
          }
        />

        <ActionCard
          icon={Wallet}
          tone="green"
          title="Paid after a reminder"
          // Currencies are never added together, so the hero shows the first
          // group and the note carries the rest — the same lead-plus-overflow
          // shape `overflowSummary` uses elsewhere, and the same fixed
          // INR/USD/SGD order `groupTotalsByCurrency` returns (it is not
          // sorted by size). An empty group list means no invoice qualifies —
          // "₹0" would read as a measured zero.
          value={leadCurrency ? formatCurrencyGroups([leadCurrency]) : "—"}
          unit="collected"
          noteIcon={recovery.recoveredCount === 0 ? Info : Repeat}
          note={
            recovery.recoveredCount === 0
              ? recovery.remindersSent === 0
                ? "No reminders recorded yet"
                : "Nothing has been paid after one yet"
              : otherCurrencies.length > 0
                ? `Plus ${formatCurrencyGroups(otherCurrencies)} · ${recovery.recoveredCount} invoices`
                : `${recovery.recoveredCount} ${recovery.recoveredCount === 1 ? "invoice" : "invoices"}${
                    recovery.avgRemindersToPayment === null
                      ? ""
                      : ` · avg ${recovery.avgRemindersToPayment} reminders`
                  }`
          }
          action={
            historyBrand ? (
              <Button asChild variant="outline" className="h-9 rounded-[10px]">
                <Link href={`/followups/brands/${historyBrand.brand.id}`} className="min-w-0">
                  <span className="max-w-[150px] truncate">
                    {historyBrand.brand.name} history
                  </span>
                </Link>
              </Button>
            ) : null
          }
        />
      </div>

      {queue.length > 0 && (
        <div id={QUEUE_ANCHOR} className="scroll-mt-8">
          <FollowupQueue entries={queue} templates={templates} onSaveInvoice={saveInvoice} />
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        <SectionLabel>Schedules by brand</SectionLabel>
        <div className="flex flex-col gap-3">
          {brands.map((brand) => (
            <div key={brand.id} id={brandAnchor(brand.id)} className="scroll-mt-8">
              <BrandFollowupCard
                brand={brand}
                invoices={invoices}
                templates={templates}
                onSaveBrand={saveBrand}
              />
            </div>
          ))}
        </div>
      </div>

      <TemplateList templates={templates} brands={brands} />
    </div>
  );
}
