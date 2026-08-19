"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  CircleCheck,
  Clock,
  Mail,
  Minus,
  Repeat,
  Send,
  TriangleAlert,
} from "lucide-react";
import { format } from "date-fns";
import {
  brandFollowupSummary,
  brandReminderHistory,
  groupEventsByMonth,
  outcomeLabel,
  recoveryByOrdinal,
  MIN_SAMPLE_FOR_RATE,
  RECOVERY_WINDOW_DAYS,
  type ReminderEvent,
} from "@/lib/followup-history";
import { scheduleSummary } from "@/lib/reminder-stages";
import { formatCurrencyGroups } from "@/lib/money";
import { formatStoredDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/page-skeletons";
import {
  IconTileOutline,
  LetterTile,
  Panel,
  SectionLabel,
  TwoLineCell,
} from "@/components/ui/primitives";

/** The colour and glyph an outcome wears. Paired with `outcomeLabel`. */
const OUTCOME_STYLE = {
  paid: { fg: "text-green", bg: "bg-green-soft", Icon: CircleCheck },
  escalated: { fg: "text-amber", bg: "bg-amber-soft", Icon: TriangleAlert },
  pending: { fg: "text-ink-3", bg: "bg-field", Icon: Minus },
  unknown: { fg: "text-ink-3", bg: "bg-field", Icon: Minus },
} as const;

function OutcomeBadge({ event }: { event: ReminderEvent }) {
  const { fg, bg, Icon } = OUTCOME_STYLE[event.outcome];
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap",
        bg,
        fg
      )}
    >
      <Icon className="size-[13px]" />
      {outcomeLabel(event)}
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Panel className="min-w-0 flex-1 px-[18px] pt-4 pb-[17px]">
      <div className="flex items-center gap-[11px]">
        <IconTileOutline icon={icon} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="mt-3.5 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </div>
      <div className="mt-2.5 text-[13px] text-ink-2">{note}</div>
    </Panel>
  );
}

/**
 * Everything sent and scheduled for one brand.
 *
 * The figures here are deliberately conservative — see
 * docs/redesign/02-followup-history.md. Reminders are identified by ordinal
 * because a brand has one cadence and one template, so every reminder it sends
 * is identical in content. No outcome claims a reminder was opened: nothing
 * tracks that.
 */
export default function BrandFollowupHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { brands, loading: brandsLoading } = useBrands();
  const { invoices, loading: invoicesLoading } = useInvoices();

  const brand = brands.find((candidate) => candidate.id === id);
  const brandInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.brandId === id),
    [invoices, id]
  );

  const summary = useMemo(() => brandFollowupSummary(brandInvoices), [brandInvoices]);
  const months = useMemo(
    () => groupEventsByMonth(brandReminderHistory(brandInvoices)),
    [brandInvoices]
  );
  const ordinals = useMemo(() => recoveryByOrdinal(brandInvoices), [brandInvoices]);

  if (brandsLoading || invoicesLoading) return <CardGridSkeleton />;
  if (!brand) notFound();

  const on = brand.followup.enabled;

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-wrap items-center gap-3.5 px-8">
        <Button asChild variant="outline" size="icon" className="size-9 rounded-[10px]">
          <Link href="/followups" aria-label="Back to follow-ups">
            <ChevronLeft className="size-[17px] text-ink-2" />
          </Link>
        </Button>
        <LetterTile letter={brand.name.slice(0, 2)} tone="blue" size={38} />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-[22px] font-semibold tracking-[-0.02em]">{brand.name}</h2>
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium",
                on ? "bg-green-soft text-green" : "bg-field text-ink-2"
              )}
            >
              <span className={cn("size-1.5 rounded-full", on ? "bg-green" : "bg-ink-3")} />
              {on ? "Reminders on" : "Reminders off"}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            Every follow-up sent for this brand · {scheduleSummary(brand.followup)}
          </p>
        </div>
        <div className="flex-1" />
        <Button asChild variant="outline" className="h-9 rounded-[10px]">
          <Link href={`/brands/${brand.id}/edit`}>Edit schedule</Link>
        </Button>
      </div>

      <div className="flex gap-4 px-8 max-xl:grid max-xl:grid-cols-2 max-sm:grid-cols-1">
        <Metric
          icon={Send}
          label="Reminders sent"
          value={String(summary.remindersSent)}
          note={`across ${summary.invoicesChased} ${summary.invoicesChased === 1 ? "invoice" : "invoices"}`}
        />
        <Metric
          icon={CircleCheck}
          label="Recovered"
          value={summary.recovered.length === 0 ? "None" : formatCurrencyGroups(summary.recovered)}
          note={`${summary.recoveredCount} paid after a nudge`}
        />
        <Metric
          icon={Repeat}
          label="Avg nudges to pay"
          value={
            summary.avgRemindersToPayment === null
              ? "—"
              : String(summary.avgRemindersToPayment)
          }
          note={summary.avgRemindersToPayment === null ? "nothing recovered yet" : "per recovered invoice"}
        />
        <Metric
          icon={Clock}
          label="Pays after a nudge"
          value={summary.paysAfterNudgePct === null ? "—" : `${summary.paysAfterNudgePct}%`}
          note={
            summary.paysAfterNudgePct === null
              ? "no chased invoice is paid yet"
              : "of chased invoices that settled"
          }
        />
        <Metric
          icon={TriangleAlert}
          label="Still unanswered"
          value={String(summary.stillUnanswered)}
          note="chased but unpaid"
        />
      </div>

      <div className="flex gap-5 px-8 max-xl:flex-col">
        <div className="flex min-w-0 flex-[1.9] flex-col gap-3.5">
          <SectionLabel>Everything sent</SectionLabel>

          {months.length === 0 ? (
            <Panel className="p-12 text-center">
              <p className="text-sm font-medium">No reminders yet</p>
              <p className="mt-1 text-sm text-ink-2">
                {on
                  ? "Nothing has gone out for this brand so far."
                  : "Reminders are switched off for this brand."}
              </p>
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <div className="flex items-center gap-4 border-b px-5 py-3 text-[12.5px] font-medium text-ink-3">
                <div className="flex-1">Sent</div>
                <div className="flex-[1.2]">Invoice</div>
                <div className="flex-[1.4]">Reminder</div>
                <div className="flex-[0_0_210px] text-right">What happened</div>
              </div>

              {months.map((month) => (
                <div key={month.key}>
                  <div className="flex items-center gap-3 border-b bg-canvas px-5 py-2.5">
                    <span className="text-[12.5px] font-semibold tracking-[0.01em] text-ink-2 uppercase">
                      {format(new Date(`${month.key}-01T00:00`), "MMMM yyyy")}
                    </span>
                    <span className="text-[12.5px] text-ink-3">
                      {month.events.length} {month.events.length === 1 ? "reminder" : "reminders"}
                    </span>
                    <span className="flex-1" />
                    {month.recovered.length > 0 && (
                      <span className="text-[12.5px] text-ink-3 tabular-nums">
                        {formatCurrencyGroups(month.recovered)} recovered
                      </span>
                    )}
                  </div>

                  {month.events.map((event) => (
                    <div
                      key={`${event.invoice.id}-${event.ordinal}`}
                      className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <TwoLineCell
                          top={formatStoredDate(event.sentOn, "d MMM")}
                          sub={formatStoredDate(event.sentOn, "yyyy")}
                        />
                      </div>
                      <div className="min-w-0 flex-[1.2]">
                        <Link href={`/invoices/${event.invoice.id}`} className="hover:underline">
                          <TwoLineCell
                            top={event.invoice.invoiceNumber}
                            sub={event.invoice.client.companyName}
                            mono
                          />
                        </Link>
                      </div>
                      <div className="min-w-0 flex-[1.4]">
                        <TwoLineCell
                          top={`Reminder ${event.ordinal}`}
                          sub={
                            event.invoice.reminders.length === event.ordinal
                              ? "most recent"
                              : `of ${event.invoice.reminders.length} so far`
                          }
                        />
                      </div>
                      <div className="flex flex-[0_0_210px] justify-end">
                        <OutcomeBadge event={event} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5 xl:max-w-[376px]">
          <Panel className="px-5 py-[18px]">
            <h3 className="text-[15.5px] font-semibold tracking-[-0.012em]">Which nudge works</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              Share of reminders at each position that were followed by payment within{" "}
              {RECOVERY_WINDOW_DAYS} days.
            </p>

            {ordinals.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-3">Nothing sent yet.</p>
            ) : (
              <div className="mt-3">
                {ordinals.map((row) => (
                  <div key={row.ordinal} className="border-b py-2.5 last:border-b-0">
                    <div className="flex items-baseline gap-2.5">
                      <span className="inline-flex size-[21px] shrink-0 items-center justify-center self-center rounded-md bg-blue-soft text-[11.5px] font-semibold text-blue">
                        {row.ordinal}
                      </span>
                      <span className="flex-1 text-[13.5px]">Reminder {row.ordinal}</span>
                      <span className="text-[13.5px] font-semibold tabular-nums">
                        {row.pct === null ? "—" : `${row.pct}%`}
                      </span>
                    </div>
                    <div className="mt-2 ml-[31px] h-[7px] rounded-[3px] bg-line-2">
                      <div
                        className="h-[7px] rounded-[3px] bg-green"
                        style={{ width: `${row.pct ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-1.5 ml-[31px] text-xs text-ink-3 tabular-nums">
                      {row.pct === null
                        ? `only ${row.sent} sent — needs ${MIN_SAMPLE_FOR_RATE} for a rate`
                        : `${row.recovered} of ${row.sent} paid within ${RECOVERY_WINDOW_DAYS} days`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="px-5 py-[18px]">
            <div className="flex items-center gap-2.5">
              <Mail className="size-[17px] text-ink-2" />
              <h3 className="flex-1 text-[15.5px] font-semibold tracking-[-0.012em]">
                This brand&apos;s schedule
              </h3>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
              {scheduleSummary(brand.followup)}
              {brand.followup.stopAfter > 0
                ? ` · stops after ${brand.followup.stopAfter}`
                : on
                  ? " · never stops"
                  : ""}
            </p>
            <div className="mt-4 flex gap-2.5 border-t pt-3.5">
              <Button asChild variant="outline" className="h-8 rounded-[9px] px-3">
                <Link href={`/brands/${brand.id}/edit`}>Edit</Link>
              </Button>
              <Button asChild variant="outline" className="h-8 rounded-[9px] px-3">
                <Link href="/followups">All brands</Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
